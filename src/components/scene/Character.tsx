"use client";

import { useRef, type RefObject } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { MathUtils, type Group, type Mesh } from "three";
import { AVATARS, SKIN_TONES, type Avatar, type AvatarId } from "@/lib/avatars";
import type { DrunkLevel } from "@/lib/drunk";
import { LYING_POSE, SEATED_POSE, STAND_HEIGHT, stuntPose } from "./tableStunt";
import VomitStream, { VOMIT_DURATION_MS } from "./VomitStream";

const HEAD_RADIUS = 0.24;
const PI = Math.PI;

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type CharacterProps = ThreeElements["group"] & {
  /** Samo za fazu animacije, da se likovi ne njišu u istom ritmu */
  seed: string;
  avatar: AvatarId;
  skin: number;
  /** Boja odjeće */
  color: string;
  /** Gost nije spojen — lik "drijema" pognute glave */
  sleepy?: boolean;
  /** Razina pijanstva 0–4 (svi je vide) */
  drunk?: DrunkLevel;
  /** performance.now() početka povraćanja, ili null */
  vomitStartedAt?: number | null;
  /** performance.now() početka penjanja na stol i pada, ili null */
  stuntStartedAt?: number | null;
  /** leži na podu (pao je i još se nije otrijeznio) */
  lying?: boolean;
  /** Glasnoća govora 0..1 (otvaranje usta) */
  talkRef?: RefObject<number>;
};

/** Njihanje tijela (amplituda, radijani) i nagib naprijed po razini pijanstva */
const SWAY_AMPLITUDE: Record<DrunkLevel, number> = { 0: 0.04, 1: 0.07, 2: 0.12, 3: 0.2, 4: 0.22 };
const LEAN: Record<DrunkLevel, number> = { 0: 0, 1: 0, 2: 0.05, 3: 0.12, 4: 0.14 };

/**
 * "Chibi" čovječuljak koji sjedi na stolici.
 * Lokalna +Z os je smjer lica — roditelj ga okreće prema sredini stola.
 * Visine su u odnosu na ploču stola (y = 0); pod je na y = -1.1.
 *
 * Napomena za SphereGeometry: kut phi = π/2 je lice (+Z), phi ∈ (π, 2π) je zatiljak (−Z).
 */
export default function Character({
  seed,
  avatar,
  skin,
  color,
  sleepy = false,
  drunk = 0,
  vomitStartedAt = null,
  stuntStartedAt = null,
  lying = false,
  talkRef,
  ...groupProps
}: CharacterProps) {
  const look = AVATARS[avatar] ?? AVATARS.m1;
  const skinColor = SKIN_TONES[skin] ?? SKIN_TONES[1];
  const phase = (hashString(seed) % 628) / 100;
  const female = look.gender === "f";

  const upperRef = useRef<Group>(null);
  const mouthRef = useRef<Mesh>(null);
  const pivotRef = useRef<Group>(null);
  const seatedLegsRef = useRef<Group>(null);
  const straightLegsRef = useRef<Group>(null);

  // "Disanje" i njihanje; pijani se njišu jače i sporije, a dok povraćaju nagnu se naprijed
  useFrame(({ clock }, delta) => {
    const g = upperRef.current;
    if (!g) return;
    const t = clock.getElapsedTime() + phase;
    const breathing = sleepy ? 0.6 : 1.6;
    const vomitAge = vomitStartedAt === null ? -1 : performance.now() - vomitStartedAt;
    const vomiting = vomitAge >= 0 && vomitAge < VOMIT_DURATION_MS;

    // Na stolici, na stolu ili na podu
    const pose =
      stuntStartedAt !== null ? stuntPose(performance.now() - stuntStartedAt) : lying ? LYING_POSE : SEATED_POSE;
    const pivot = pivotRef.current;
    if (pivot) {
      pivot.position.set(...pose.feet);
      pivot.rotation.set(pose.tilt, pose.yaw, 0, "YXZ");
    }
    if (seatedLegsRef.current) seatedLegsRef.current.visible = !pose.straightLegs;
    if (straightLegsRef.current) straightLegsRef.current.visible = pose.straightLegs;

    g.position.y = Math.sin(t * breathing) * 0.012;
    const swaySpeed = drunk >= 2 ? 0.45 : 0.7;
    const still = sleepy || vomiting || pose.lying || pose.straightLegs;
    g.rotation.z = still ? 0 : Math.sin(t * swaySpeed) * SWAY_AMPLITUDE[drunk];
    const lean = pose.straightLegs
      ? pose.lean
      : sleepy
        ? 0.35
        : vomiting
          ? 0.5 + Math.sin(vomitAge / 90) * 0.04
          : LEAN[drunk];
    g.rotation.x = MathUtils.damp(g.rotation.x, lean, vomiting || pose.straightLegs ? 8 : 3, delta);

    // Dok priča, osmijeh se "otvara" u usta
    const mouth = mouthRef.current;
    if (mouth) {
      const talk = talkRef?.current ?? 0;
      mouth.scale.set(1 - talk * 0.25, 1 + talk * 3, 1);
    }
  });

  return (
    <group {...groupProps}>
      <Chair />
      <VomitStream startedAt={vomitStartedAt} />

      {/* Tijelo se okreće oko stopala (penjanje na stol i pad na leđa) */}
      <group ref={pivotRef} position={[0, -STAND_HEIGHT, 0]}>
        <group position-y={STAND_HEIGHT}>
          {/* Noge savijene na stolici */}
          <group ref={seatedLegsRef}>
            {[-0.1, 0.1].map((x) => (
              <group key={x}>
                <mesh position={[x, -0.42, 0.14]} rotation-x={PI / 2}>
                  <capsuleGeometry args={[0.075, 0.2, 4, 10]} />
                  <meshStandardMaterial color="#34405a" roughness={0.8} />
                </mesh>
                <mesh position={[x, -0.72, 0.3]}>
                  <capsuleGeometry args={[0.07, 0.42, 4, 10]} />
                  <meshStandardMaterial color="#34405a" roughness={0.8} />
                </mesh>
              </group>
            ))}
          </group>
          {/* Ispružene noge (stoji na stolu ili leži) */}
          <group ref={straightLegsRef} visible={false}>
            {[-0.1, 0.1].map((x) => (
              <group key={x}>
                <mesh position={[x, -0.62, 0]}>
                  <capsuleGeometry args={[0.075, 0.2, 4, 10]} />
                  <meshStandardMaterial color="#34405a" roughness={0.8} />
                </mesh>
                <mesh position={[x, -0.95, 0.02]}>
                  <capsuleGeometry args={[0.07, 0.42, 4, 10]} />
                  <meshStandardMaterial color="#34405a" roughness={0.8} />
                </mesh>
              </group>
            ))}
          </group>

          <group ref={upperRef}>
            {/* Tijelo (žene malo užih ramena) */}
            <mesh position={[0, -0.08, 0]}>
              <capsuleGeometry args={[female ? 0.215 : 0.24, 0.36, 6, 16]} />
              <meshStandardMaterial color={color} roughness={0.65} />
            </mesh>

            {/* Ruke, blago ispružene prema stolu */}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * (female ? 0.26 : 0.28), 0.02, 0.12]} rotation={[0.9, 0, side * -0.25]}>
                <capsuleGeometry args={[0.065, 0.3, 4, 10]} />
                <meshStandardMaterial color={color} roughness={0.65} />
              </mesh>
            ))}

            <group position={[0, 0.5, 0]}>
              <mesh>
                <sphereGeometry args={[HEAD_RADIUS, 24, 18]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
              <Face look={look} skinColor={skinColor} drunk={drunk} mouthRef={mouthRef} />
              <Hair look={look} />
              <FacialHair look={look} />
              {look.glasses && <Glasses />}
              {look.beanie && <Beanie />}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function Chair() {
  return (
    <>
      <mesh position={[0, -0.5, -0.05]}>
        <cylinderGeometry args={[0.3, 0.3, 0.06, 20]} />
        <meshStandardMaterial color="#3b2416" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.8, -0.05]}>
        <cylinderGeometry args={[0.045, 0.06, 0.6, 10]} />
        <meshStandardMaterial color="#2e1c11" roughness={0.7} />
      </mesh>
      <mesh position={[0, -1.08, -0.05]}>
        <cylinderGeometry args={[0.22, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#2e1c11" roughness={0.7} />
      </mesh>
    </>
  );
}

function Face({
  look,
  skinColor,
  drunk,
  mouthRef,
}: {
  look: Avatar;
  skinColor: string;
  drunk: DrunkLevel;
  mouthRef: RefObject<Mesh | null>;
}) {
  const female = look.gender === "f";
  return (
    <>
      {/* Oči (jako pijani žmire) */}
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 0.01, 0.215]} scale={[1, drunk >= 3 ? 0.35 : 1, 1]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
        </mesh>
      ))}
      {/* Trepavice */}
      {female &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.105, 0.04, 0.212]} rotation-z={side * -0.6}>
            <boxGeometry args={[0.03, 0.008, 0.01]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
      {/* Crveni obrazi */}
      {drunk >= 2 &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.13, -0.05, 0.19]} scale={[1, 0.6, 0.4]}>
            <sphereGeometry args={[0.045, 12, 8]} />
            <meshStandardMaterial color="#ff5a6e" roughness={0.8} transparent opacity={0.55 + drunk * 0.08} />
          </mesh>
        ))}
      {/* Nos (pijanima pocrveni) */}
      <mesh position={[0, -0.025, 0.238]}>
        <sphereGeometry args={[0.026, 10, 8]} />
        <meshStandardMaterial color={drunk >= 3 ? "#e8606a" : skinColor} roughness={0.6} />
      </mesh>
      {/* Osmijeh (žene s ružem) */}
      <mesh ref={mouthRef} position={[0, -0.085, 0.208]} rotation-z={PI}>
        <torusGeometry args={[0.048, female ? 0.014 : 0.011, 6, 16, PI]} />
        <meshStandardMaterial color={female ? "#b8324f" : "#7a3b2e"} roughness={0.5} />
      </mesh>
    </>
  );
}

function HairMaterial({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <meshStandardMaterial color={color} roughness={0.85} transparent={opacity < 1} opacity={opacity} />;
}

/** Kapa kose preko tjemena; nagnuta unatrag da se vidi čelo */
function Cap({ color, radius = 0.252, tilt = -0.28, thetaLength = PI * 0.5 }: { color: string; radius?: number; tilt?: number; thetaLength?: number }) {
  return (
    <mesh rotation-x={tilt} position-y={0.01}>
      <sphereGeometry args={[radius, 24, 12, 0, PI * 2, 0, thetaLength]} />
      <HairMaterial color={color} />
    </mesh>
  );
}

/** Kosa na zatiljku, od thetaStart do thetaEnd (0 = tjeme, π = brada) */
function BackShell({ color, from, to, radius = 0.252 }: { color: string; from: number; to: number; radius?: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 24, 12, PI, PI, from, to - from]} />
      <HairMaterial color={color} />
    </mesh>
  );
}

/** Kovrče: male kuglice raspoređene po gornjem dijelu glave (bez čela) */
function Curls({ color, size = 0.075, count = 22 }: { color: string; size?: number; count?: number }) {
  const curls: [number, number, number][] = [];
  for (let i = 0; i < count * 2 && curls.length < count; i++) {
    const theta = Math.acos(1 - (i + 0.5) / (count * 2)) * 1.25; // gušće pri tjemenu
    const phi = i * 2.39996; // zlatni kut
    const y = Math.cos(theta) * 0.245;
    const z = Math.sin(phi) * Math.sin(theta) * 0.245;
    const x = -Math.cos(phi) * Math.sin(theta) * 0.245;
    if (z > 0.1 && y < 0.14) continue; // ostavi čelo slobodno
    curls.push([x, y + 0.01, z]);
  }
  return (
    <>
      {curls.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[size, 8, 6]} />
          <HairMaterial color={color} />
        </mesh>
      ))}
    </>
  );
}

function Hair({ look }: { look: Avatar }) {
  const c = look.hairColor;
  switch (look.hair) {
    case "short":
      return (
        <>
          <Cap color={c} />
          <BackShell color={c} from={PI * 0.3} to={PI * 0.7} />
        </>
      );
    case "curly":
      return (
        <>
          <Cap color={c} tilt={-0.35} radius={0.246} />
          <Curls color={c} />
          <BackShell color={c} from={PI * 0.3} to={PI * 0.66} radius={0.256} />
        </>
      );
    case "bald":
      // Samo vijenac kose iznad ušiju i na zatiljku
      return <BackShell color={c} from={PI * 0.48} to={PI * 0.68} radius={0.248} />;
    case "bun":
      return (
        <>
          <BackShell color={c} from={PI * 0.4} to={PI * 0.7} />
          <mesh position={[0, -0.02, -0.27]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <HairMaterial color={c} />
          </mesh>
        </>
      );
    case "long":
      return (
        <>
          <Cap color={c} tilt={-0.25} />
          <BackShell color={c} from={PI * 0.3} to={PI * 0.82} radius={0.26} />
          {/* Kosa niz leđa */}
          <mesh position={[0, -0.28, -0.19]}>
            <boxGeometry args={[0.44, 0.42, 0.07]} />
            <HairMaterial color={c} />
          </mesh>
          {/* Pramenovi uz lice */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.215, -0.14, 0.03]}>
              <boxGeometry args={[0.065, 0.36, 0.1]} />
              <HairMaterial color={c} />
            </mesh>
          ))}
        </>
      );
    case "ponytail":
      return (
        <>
          <Cap color={c} tilt={-0.3} />
          <BackShell color={c} from={PI * 0.3} to={PI * 0.62} />
          <mesh position={[0, 0.08, -0.25]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color="#d6336c" roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.1, -0.32]} rotation-x={-0.35}>
            <capsuleGeometry args={[0.055, 0.28, 4, 10]} />
            <HairMaterial color={c} />
          </mesh>
        </>
      );
    case "bob":
      return (
        <>
          <Cap color={c} tilt={-0.2} radius={0.262} />
          {/* Zatiljak i bokovi do brade */}
          <mesh>
            <sphereGeometry args={[0.266, 24, 12, PI * 0.9, PI * 1.2, PI * 0.2, PI * 0.5]} />
            <HairMaterial color={c} />
          </mesh>
          {/* Šiške */}
          <mesh>
            <sphereGeometry args={[0.258, 20, 6, PI * 0.2, PI * 0.6, PI * 0.08, PI * 0.2]} />
            <HairMaterial color={c} />
          </mesh>
        </>
      );
    case "topBun":
      return (
        <>
          <Cap color={c} tilt={-0.3} radius={0.246} />
          <Curls color={c} size={0.06} count={18} />
          <mesh position={[0, 0.28, -0.04]}>
            <sphereGeometry args={[0.11, 14, 10]} />
            <HairMaterial color={c} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos(i * 1.26) * 0.09, 0.3 + (i % 2) * 0.04, -0.04 + Math.sin(i * 1.26) * 0.09]}>
              <sphereGeometry args={[0.045, 8, 6]} />
              <HairMaterial color={c} />
            </mesh>
          ))}
        </>
      );
  }
}

function FacialHair({ look }: { look: Avatar }) {
  const c = look.hairColor;
  const mustache = (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.04, -0.056, 0.236]} rotation-z={PI / 2 + side * 0.4}>
          <capsuleGeometry args={[0.022, 0.06, 4, 8]} />
          <HairMaterial color={c} />
        </mesh>
      ))}
    </>
  );
  // Brada: donji prednji dio glave
  const beardShell = (opacity: number) => (
    <mesh>
      <sphereGeometry args={[0.25, 20, 10, PI * 0.08, PI * 0.84, PI * 0.58, PI * 0.36]} />
      <HairMaterial color={c} opacity={opacity} />
    </mesh>
  );

  switch (look.facialHair) {
    case "beard":
      return (
        <>
          {beardShell(1)}
          {mustache}
        </>
      );
    case "stubble":
      return beardShell(0.35);
    case "mustache":
      return mustache;
    default:
      return null;
  }
}

function Glasses() {
  return (
    <group position={[0, 0.012, 0.228]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.085, 0, 0]}>
          <torusGeometry args={[0.055, 0.01, 8, 20]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.3} metalness={0.4} />
        </mesh>
      ))}
      <mesh rotation-z={PI / 2}>
        <capsuleGeometry args={[0.007, 0.05, 4, 6]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

function Beanie() {
  const color = "#2f5d6b";
  return (
    <group rotation-x={-0.18} position-y={0.015}>
      <mesh>
        <sphereGeometry args={[0.27, 24, 12, 0, PI * 2, 0, PI * 0.46]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Zavrnuti rub */}
      <mesh position-y={0.034} rotation-x={PI / 2}>
        <torusGeometry args={[0.262, 0.034, 8, 32]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Pompon */}
      <mesh position-y={0.29}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color="#e9e4d8" roughness={1} />
      </mesh>
    </group>
  );
}
