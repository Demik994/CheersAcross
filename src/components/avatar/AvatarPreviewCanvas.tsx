"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group } from "three";
import Character from "@/components/scene/Character";
import type { Look } from "@/lib/roomApi";

function Turntable({ look, color }: { look: Look; color: string }) {
  const ref = useRef<Group>(null);
  // Polako okretanje s povremenim pogledom sprijeda
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.8) * 0.9;
  });
  return (
    <group ref={ref}>
      <Character seed="preview" avatar={look.avatar} skin={look.skin} color={color} />
    </group>
  );
}

/** Mali 3D prikaz odabranog lika (glava i gornji dio tijela) */
export default function AvatarPreviewCanvas({ look, color }: { look: Look; color: string }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.45, 1.75], fov: 32 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.28, 0)}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[1.5, 2.5, 2]} intensity={2.2} color="#ffe3c2" />
      <directionalLight position={[-2, 1, -1]} intensity={0.8} color="#9fc2ff" />
      <Turntable look={look} color={color} />
    </Canvas>
  );
}
