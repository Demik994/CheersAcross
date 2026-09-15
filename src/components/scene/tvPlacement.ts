import { Euler, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { DEFAULT_CAMERA_POSITION, DEFAULT_TARGET } from "./CameraRig";
import { CRT, SCREEN_CORNERS } from "./CrtTvModel";
import { fovForAspect } from "./ResponsiveCamera";
import { FLOOR_Y } from "./Table";

/**
 * Gdje u sobi stoji televizor (za zadanu veličinu ekrana).
 *
 * 1. Ako ima mjesta, TV je toliko velik da mu ekran u početnom kadru ima barem ~210 px
 *    (YouTube traži 200) — tada video svira na njemu odmah (računalo, tablet).
 * 2. Inače (mobitel uspravno) stoji uz stol normalne veličine; video je u kutu dok gost
 *    ne dodirne TV i kamera doleti do njega.
 * U oba slučaja TV ne smije ući u krug gostiju i mora biti između zaglavlja i donjeg panela.
 */
export type TvPlacement = {
  /** točka na podu/ormariću ispod nožica */
  feet: [number, number, number];
  yaw: number;
  /** nagib unatrag prema kameri */
  pitch: number;
  scale: number;
  standHeight: number;
  screenCenter: Vector3;
  /** smjer u kojem ekran gleda */
  normal: Vector3;
  /** true = ekran je dovoljno velik već u početnom kadru */
  bigEnough: boolean;
};

const BIG_SCREEN_PX = 214;
const NATURAL_SCALE = 0.72;
const SCREEN_TOP_MIN_PX = 64;
const SCREEN_BOTTOM_MAX = 0.62;
/** Gosti sjede na 2,35; lik je širok ~0,5 */
const GUEST_RING = 2.9;
const FEET_OFFSET = CRT.feet - CRT.bottom;

const cache = new Map<string, TvPlacement>();

function defaultCamera(width: number, height: number) {
  const aspect = width / height;
  const camera = new PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, 60);
  camera.position.set(...DEFAULT_CAMERA_POSITION);
  camera.lookAt(new Vector3(...DEFAULT_TARGET));
  camera.updateMatrixWorld();
  return camera;
}

function tvMatrix(feet: Vector3, yaw: number, pitch: number) {
  return new Matrix4().makeRotationFromEuler(new Euler(-pitch, yaw, 0, "YXZ")).setPosition(feet);
}

export function tvPlacement(width: number, height: number): TvPlacement {
  const key = `${Math.round(width)}x${Math.round(height)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const camera = defaultCamera(width, height);
  const feet = new Vector3();
  const local = new Vector3();
  let bestBig: (TvPlacement & { score: number }) | null = null;
  let bestNatural: (TvPlacement & { score: number }) | null = null;

  for (const big of [true, false]) {
    for (let x = 4.5; x >= -4.51; x -= 0.5) {
      for (let z = -6; z <= 3.01; z += 0.4) {
        for (let stand = 0; stand <= 1.61; stand += 0.2) {
          feet.set(x, FLOOR_Y + stand, z);
          const yaw = Math.atan2(camera.position.x - x, camera.position.z - z);
          let scale = big ? 1 : NATURAL_SCALE;
          let pitch = 0;
          let projected: [number, number][] = [];
          for (let i = 0; i < (big ? 5 : 2); i++) {
            const centerY = feet.y + FEET_OFFSET * scale;
            pitch = Math.atan2(camera.position.y - centerY, Math.hypot(camera.position.x - x, camera.position.z - z));
            const matrix = tvMatrix(feet, yaw, pitch);
            projected = SCREEN_CORNERS.map(([cx, cy]) => {
              local.set(cx * scale, (cy + FEET_OFFSET) * scale, 0).applyMatrix4(matrix).project(camera);
              return [((local.x + 1) / 2) * width, ((1 - local.y) / 2) * height];
            });
            if (!big) continue;
            let minSide = Infinity;
            for (let k = 0; k < 4; k++) {
              const [ax, ay] = projected[k];
              const [bx, by] = projected[(k + 1) % 4];
              minSide = Math.min(minSide, Math.hypot(bx - ax, by - ay));
            }
            scale *= BIG_SCREEN_PX / minSide;
          }

          // Kućište ne smije u krug gostiju
          if (Math.hypot(x, z) - CRT.halfWidth * scale < GUEST_RING) continue;
          const ys = projected.map((p) => p[1]);
          const xs = projected.map((p) => p[0]);
          const pad = (Math.max(...xs) - Math.min(...xs)) * 0.12;
          if (Math.min(...ys) < SCREEN_TOP_MIN_PX || Math.max(...ys) > height * SCREEN_BOTTOM_MAX) continue;
          if (Math.min(...xs) - pad < 6 || Math.max(...xs) + pad > width - 6) continue;

          const matrix = tvMatrix(feet, yaw, pitch);
          const candidate = {
            feet: [x, feet.y, z] as [number, number, number],
            yaw,
            pitch,
            scale,
            standHeight: stand,
            screenCenter: new Vector3(0, FEET_OFFSET * scale, 0).applyMatrix4(matrix),
            normal: new Vector3(0, 0, 1).transformDirection(matrix),
            bigEnough: big,
            // Veliki: uz stol, ekran na ~trećini visine, što manji i što manje okrenut.
            // Normalni: lijevo iza stola (desno je mali ekran), na niskom ormariću.
            score: big
              ? scale * 0.5 +
                Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 / height - 0.36) * 3 +
                Math.abs(stand - 0.5) * 0.3 +
                Math.abs(yaw) * 0.8
              : Math.hypot(x + 2.6, z + 3.4) + Math.abs(stand - 0.6) * 0.4,
          };
          if (big && (!bestBig || candidate.score < bestBig.score)) bestBig = candidate;
          if (!big && (!bestNatural || candidate.score < bestNatural.score)) bestNatural = candidate;
        }
      }
    }
    if (bestBig) break;
  }

  const fallbackMatrix = tvMatrix(new Vector3(-2.6, FLOOR_Y + 0.6, -3.4), 0, 0);
  const result: TvPlacement = bestBig ??
    bestNatural ?? {
      feet: [-2.6, FLOOR_Y + 0.6, -3.4],
      yaw: 0,
      pitch: 0,
      scale: NATURAL_SCALE,
      standHeight: 0.6,
      screenCenter: new Vector3(0, FEET_OFFSET * NATURAL_SCALE, 0).applyMatrix4(fallbackMatrix),
      normal: new Vector3(0, 0, 1),
      bigEnough: false,
    };
  cache.set(key, result);
  return result;
}

/** Kamera ispred televizora: ekran lijepo velik i iznad donjeg panela */
export function tvCloseUpView(placement: TvPlacement, width: number, height: number) {
  const aspect = width / height;
  const halfFovTan = Math.tan((fovForAspect(aspect) * Math.PI) / 360);
  const screenPx = Math.max(236, Math.min(width * 0.66, height * 0.4));
  const distance = (2 * placement.scale * height) / (2 * halfFovTan * screenPx);
  const viewHeight = 2 * distance * halfFovTan;

  const target = placement.screenCenter.clone().add(new Vector3(0, -viewHeight * 0.14, 0));
  const position = placement.screenCenter
    .clone()
    .addScaledVector(placement.normal, distance)
    .add(new Vector3(0, distance * 0.08, 0));
  return { position, target };
}
