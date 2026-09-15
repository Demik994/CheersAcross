import { Euler, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { DEFAULT_CAMERA_POSITION, DEFAULT_TARGET } from "./CameraRig";
import { CRT, SCREEN_CORNERS } from "./CrtTvModel";
import { fovForAspect } from "./ResponsiveCamera";
import { FLOOR_Y } from "./Table";

/**
 * Gdje u sobi stoji televizor (za zadanu veličinu ekrana): lijevo iza stola, na niskom ormariću,
 * izvan kruga gostiju i u početnom kadru između zaglavlja i donjeg panela.
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
};

const TV_SCALE = 0.8;
const IDEAL = { x: -2.6, z: -3.4, stand: 0.6 };
const SCREEN_TOP_MIN_PX = 64;
const SCREEN_BOTTOM_MAX = 0.62;
/** Gosti sjede na 2,35; lik je širok ~0,5 */
const GUEST_RING = 2.9;
const FEET_OFFSET = CRT.feet - CRT.bottom;

const cache = new Map<string, TvPlacement>();

function tvMatrix(feet: Vector3, yaw: number, pitch: number) {
  return new Matrix4().makeRotationFromEuler(new Euler(-pitch, yaw, 0, "YXZ")).setPosition(feet);
}

function describe(feet: Vector3, camera: PerspectiveCamera, stand: number): TvPlacement {
  const yaw = Math.atan2(camera.position.x - feet.x, camera.position.z - feet.z);
  const centerY = feet.y + FEET_OFFSET * TV_SCALE;
  const pitch = Math.atan2(camera.position.y - centerY, Math.hypot(camera.position.x - feet.x, camera.position.z - feet.z));
  const matrix = tvMatrix(feet, yaw, pitch);
  return {
    feet: [feet.x, feet.y, feet.z],
    yaw,
    pitch,
    scale: TV_SCALE,
    standHeight: stand,
    screenCenter: new Vector3(0, FEET_OFFSET * TV_SCALE, 0).applyMatrix4(matrix),
    normal: new Vector3(0, 0, 1).transformDirection(matrix),
  };
}

export function tvPlacement(width: number, height: number): TvPlacement {
  const key = `${Math.round(width)}x${Math.round(height)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const aspect = width / height;
  const camera = new PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, 60);
  camera.position.set(...DEFAULT_CAMERA_POSITION);
  camera.lookAt(new Vector3(...DEFAULT_TARGET));
  camera.updateMatrixWorld();

  const feet = new Vector3();
  const corner = new Vector3();
  let best: { placement: TvPlacement; score: number } | null = null;

  for (let x = -4.5; x <= 4.51; x += 0.5) {
    for (let z = -6; z <= 3.01; z += 0.4) {
      // Kućište ne smije u krug gostiju
      if (Math.hypot(x, z) - CRT.halfWidth * TV_SCALE < GUEST_RING) continue;
      for (let stand = 0; stand <= 1.61; stand += 0.2) {
        feet.set(x, FLOOR_Y + stand, z);
        const placement = describe(feet, camera, stand);
        const matrix = tvMatrix(feet, placement.yaw, placement.pitch);
        const projected = SCREEN_CORNERS.map(([cx, cy]) => {
          corner.set(cx * TV_SCALE, (cy + FEET_OFFSET) * TV_SCALE, 0).applyMatrix4(matrix).project(camera);
          return [((corner.x + 1) / 2) * width, ((1 - corner.y) / 2) * height];
        });
        const xs = projected.map((p) => p[0]);
        const ys = projected.map((p) => p[1]);
        const pad = (Math.max(...xs) - Math.min(...xs)) * 0.12;
        if (Math.min(...ys) < SCREEN_TOP_MIN_PX || Math.max(...ys) > height * SCREEN_BOTTOM_MAX) continue;
        if (Math.min(...xs) - pad < 6 || Math.max(...xs) + pad > width - 6) continue;

        const score = Math.hypot(x - IDEAL.x, z - IDEAL.z) + Math.abs(stand - IDEAL.stand) * 0.4;
        if (!best || score < best.score) best = { placement, score };
      }
    }
  }

  const result = best?.placement ?? describe(new Vector3(IDEAL.x, FLOOR_Y + IDEAL.stand, IDEAL.z), camera, IDEAL.stand);
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
