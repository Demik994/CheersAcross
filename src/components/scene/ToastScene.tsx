"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { PublicGuest } from "@/lib/rooms/types";
import CameraRig, { DEFAULT_TARGET } from "./CameraRig";
import CelebrationPhoto from "./CelebrationPhoto";
import GuestSeat from "./GuestSeat";
import ResponsiveCamera from "./ResponsiveCamera";
import Table, { TABLE_TOP_Y } from "./Table";

export type ToastSceneProps = {
  guests: PublicGuest[];
  meId: string;
  photoUrl: string | null;
  photoRevealed: boolean;
};

export default function ToastScene({ guests, meId, photoUrl, photoRevealed }: ToastSceneProps) {
  // Svaki gost vidi sebe na mjestu najbližem kameri, ostali su raspoređeni u krug
  const myIndex = Math.max(0, guests.findIndex((g) => g.id === meId));

  return (
    <Canvas
      className="touch-none"
      // Na mobitelima s dpr 3 ograničavamo na 2 radi performansi
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#1a120d"]} />
      <fog attach="fog" args={["#1a120d", 8, 18]} />

      <ResponsiveCamera />

      <ambientLight intensity={0.45} />
      <spotLight
        position={[2.5, 6, 2]}
        angle={0.7}
        penumbra={0.8}
        intensity={45}
        color="#ffd9a8"
      />
      <pointLight position={[-3, 2, -2]} intensity={8} color="#8fb4ff" />

      {/* Lokalni environment (bez preuzimanja HDR-a) — daje refleksije na staklu */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#ffcf99" position={[4, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[3, 1, 1]} />
        <Lightformer form="rect" intensity={1} color="#9fc2ff" position={[-4, 1.5, 0]} rotation-y={Math.PI / 2} scale={[3, 1, 1]} />
      </Environment>

      <Table />

      {guests.map((guest, i) => (
        <GuestSeat
          key={guest.id}
          guest={guest}
          isMe={guest.id === meId}
          angle={((i - myIndex) / guests.length) * Math.PI * 2}
        />
      ))}

      <CelebrationPhoto url={photoUrl} revealed={photoRevealed} />

      <ContactShadows
        position={[0, TABLE_TOP_Y + 0.002, 0]}
        scale={3.6}
        far={1.5}
        blur={2.2}
        opacity={0.55}
        resolution={512}
      />

      <OrbitControls
        makeDefault
        target={DEFAULT_TARGET}
        enablePan={false}
        enableDamping
        minDistance={2.5}
        maxDistance={9}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.45}
      />
      <CameraRig revealed={photoRevealed} />
    </Canvas>
  );
}
