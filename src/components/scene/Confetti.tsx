"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, Object3D, type InstancedMesh } from "three";

const COUNT = 90;
const DURATION_MS = 4500;
const COLORS = ["#fcd34d", "#f472b6", "#60a5fa", "#34d399", "#f87171", "#c084fc", "#ffffff"];

// Nasumični raspored komadića — isti za svaku proslavu, izračunat jednom
const PIECES = Array.from({ length: COUNT }, () => ({
  x: (Math.random() - 0.5) * 5,
  z: (Math.random() - 0.5) * 5,
  startY: 3.2 + Math.random() * 2.5,
  speed: 0.9 + Math.random() * 0.8,
  sway: Math.random() * Math.PI * 2,
  spin: 2 + Math.random() * 6,
}));

const dummy = new Object3D();

/**
 * Konfeti koji padaju oko stola kad se slika otkrije.
 * InstancedMesh = jedan draw call za sve komadiće.
 */
export default function Confetti({ startAt }: { startAt: number | null }) {
  const meshRef = useRef<InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const elapsed = startAt === null ? -1 : (performance.now() - startAt) / 1000;
    const active = elapsed >= 0 && elapsed * 1000 < DURATION_MS;
    mesh.visible = active;
    if (!active) return;

    if (mesh.instanceColor === null) {
      PIECES.forEach((_, i) => mesh.setColorAt(i, new Color(COLORS[i % COLORS.length])));
    }

    PIECES.forEach((piece, i) => {
      const y = piece.startY - elapsed * piece.speed * 1.4;
      dummy.position.set(
        piece.x + Math.sin(elapsed * 2 + piece.sway) * 0.25,
        Math.max(y, -1.05),
        piece.z + Math.cos(elapsed * 1.7 + piece.sway) * 0.25,
      );
      dummy.rotation.set(elapsed * piece.spin, elapsed * piece.spin * 0.7, piece.sway);
      dummy.scale.setScalar(y < -1 ? 0.0001 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} frustumCulled={false} visible={false}>
      <planeGeometry args={[0.07, 0.11]} />
      <meshStandardMaterial side={DoubleSide} roughness={0.6} />
    </instancedMesh>
  );
}
