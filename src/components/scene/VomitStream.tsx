"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Object3D, type InstancedMesh, type Mesh } from "three";

/** Koliko dugo mlaz traje (ms) — RoomView za toliko odgađa otkrivanje slike */
export const VOMIT_DURATION_MS = 2400;
const EMIT_MS = 1700;
const COUNT = 160;
const GRAVITY = 4.9;
/** Usta lika u lokalnim koordinatama lika (+Z = prema stolu) */
const MOUTH = { y: 0.41, z: 0.26 };
const PUDDLE_Z = 0.88;

// Blago različita brzina i smjer svake "kapi" (isti za svako povraćanje)
const PARTICLES = Array.from({ length: COUNT }, (_, i) => ({
  spawn: (i / COUNT) * EMIT_MS,
  vz: 2.2 + ((i * 37) % 11) / 25,
  vy: 0.45 + ((i * 17) % 7) / 20,
  x: (((i * 53) % 13) - 6) / 220,
  size: 0.7 + ((i * 29) % 5) / 10,
}));

const dummy = new Object3D();

/**
 * Crtićki mlaz povraćanja: kapi lete iz usta u luku i padaju na stol, gdje ostaje lokva
 * do sljedeće runde. Crta se u lokalnim koordinatama lika (dio Character grupe).
 */
export default function VomitStream({ startedAt }: { startedAt: number | null }) {
  const dropsRef = useRef<InstancedMesh>(null);
  const puddleRef = useRef<Mesh>(null);

  useFrame(() => {
    const drops = dropsRef.current;
    const puddle = puddleRef.current;
    if (!drops || !puddle) return;

    const elapsed = startedAt === null ? -1 : performance.now() - startedAt;
    if (elapsed < 0) {
      drops.visible = false;
      puddle.visible = false;
      return;
    }

    let anyVisible = false;
    PARTICLES.forEach((p, i) => {
      const age = (elapsed - p.spawn) / 1000;
      const y = MOUTH.y + p.vy * age - GRAVITY * age * age;
      const alive = age > 0 && y > 0.01;
      if (alive) anyVisible = true;
      dummy.position.set(p.x * (1 + age * 3), Math.max(y, 0.01), MOUTH.z + p.vz * age);
      dummy.scale.setScalar(alive ? p.size : 0.0001);
      dummy.updateMatrix();
      drops.setMatrixAt(i, dummy.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
    drops.visible = anyVisible;

    // Lokva raste dok mlaz pada, zatim ostaje
    const growth = Math.min(Math.max((elapsed - 350) / 1500, 0), 1);
    puddle.visible = growth > 0;
    puddle.scale.set(growth, growth * 0.8, 1);
  });

  return (
    <>
      <instancedMesh ref={dropsRef} args={[undefined, undefined, COUNT]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[0.034, 8, 6]} />
        <meshStandardMaterial color="#a4bf3c" roughness={0.35} />
      </instancedMesh>
      <mesh ref={puddleRef} position={[0, 0.006, PUDDLE_Z]} rotation-x={-Math.PI / 2} visible={false}>
        <circleGeometry args={[0.22, 24]} />
        <meshStandardMaterial color="#9bb53a" roughness={0.3} transparent opacity={0.88} side={DoubleSide} />
      </mesh>
    </>
  );
}
