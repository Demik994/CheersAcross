"use client";

import { useRef } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { MathUtils, type Group } from "three";

const SKIN_TONES = ["#f1c6a5", "#e0ac86", "#c68863", "#8d5a3b", "#f6d7c3"];
const HAIR_COLORS = ["#2b1b12", "#5a3a22", "#a8652a", "#d9b36c", "#1e1e24", "#7a2e1f"];

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type CharacterProps = ThreeElements["group"] & {
  seed: string;
  color: string;
  /** Gost nije spojen — lik "drijema" pognute glave */
  sleepy?: boolean;
};

/**
 * Jednostavan "chibi" čovječuljak koji sjedi na stolici.
 * Lokalna +Z os je smjer lica — roditelj ga okreće prema sredini stola.
 * Visine su u odnosu na ploču stola (y = 0); pod je na y = -1.1.
 */
export default function Character({ seed, color, sleepy = false, ...groupProps }: CharacterProps) {
  const hash = hashString(seed);
  const skin = SKIN_TONES[hash % SKIN_TONES.length];
  const hair = HAIR_COLORS[(hash >> 3) % HAIR_COLORS.length];
  const phase = (hash % 628) / 100;

  const upperRef = useRef<Group>(null);

  // Lagano "disanje" i njihanje glave da lik ne izgleda kao kip
  useFrame(({ clock }, delta) => {
    const g = upperRef.current;
    if (!g) return;
    const t = clock.getElapsedTime() + phase;
    const breathing = sleepy ? 0.6 : 1.6;
    g.position.y = Math.sin(t * breathing) * 0.012;
    g.rotation.z = sleepy ? 0 : Math.sin(t * 0.7) * 0.04;
    g.rotation.x = MathUtils.damp(g.rotation.x, sleepy ? 0.35 : 0, 3, delta);
  });

  return (
    <group {...groupProps}>
      {/* Stolica */}
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

      {/* Noge */}
      {[-0.1, 0.1].map((x) => (
        <group key={x}>
          <mesh position={[x, -0.42, 0.14]} rotation-x={Math.PI / 2}>
            <capsuleGeometry args={[0.075, 0.2, 4, 10]} />
            <meshStandardMaterial color="#34405a" roughness={0.8} />
          </mesh>
          <mesh position={[x, -0.72, 0.3]}>
            <capsuleGeometry args={[0.07, 0.42, 4, 10]} />
            <meshStandardMaterial color="#34405a" roughness={0.8} />
          </mesh>
        </group>
      ))}

      <group ref={upperRef}>
        {/* Tijelo */}
        <mesh position={[0, -0.08, 0]}>
          <capsuleGeometry args={[0.24, 0.36, 6, 16]} />
          <meshStandardMaterial color={color} roughness={0.65} />
        </mesh>

        {/* Ruke, blago ispružene prema stolu */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.28, 0.02, 0.12]} rotation={[0.9, 0, side * -0.25]}>
            <capsuleGeometry args={[0.065, 0.3, 4, 10]} />
            <meshStandardMaterial color={color} roughness={0.65} />
          </mesh>
        ))}

        {/* Glava */}
        <group position={[0, 0.5, 0]}>
          <mesh>
            <sphereGeometry args={[0.24, 24, 18]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
          {/* Kosa — kapa preko tjemena i zatiljka (vidi se kad lik gleda od kamere) */}
          <mesh position={[0, 0.05, -0.03]} scale={[1.06, 0.92, 1.06]}>
            <sphereGeometry args={[0.245, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hair} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.02, -0.06]} scale={[1.02, 1, 0.9]}>
            <sphereGeometry args={[0.24, 20, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.45]} />
            <meshStandardMaterial color={hair} roughness={0.8} />
          </mesh>
          {/* Oči */}
          {[-0.08, 0.08].map((x) => (
            <mesh key={x} position={[x, 0.01, 0.215]}>
              <sphereGeometry args={[0.028, 10, 8]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
            </mesh>
          ))}
          {/* Osmijeh */}
          <mesh position={[0, -0.075, 0.21]} rotation-z={Math.PI}>
            <torusGeometry args={[0.05, 0.011, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#7a3b2e" roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
