"use client";

import type { RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { ClinkEvent, GlassTargets, LiveInfo } from "@/hooks/useLiveRoom";
import { DRINK_DURATION_MS, REVEAL_ALREADY_DONE, seatAngle } from "@/lib/party/geometry";
import type { GlassPosition } from "@/lib/party/protocol";
import type { PublicGuest } from "@/lib/rooms/types";
import CameraRig, { DEFAULT_TARGET } from "./CameraRig";
import CelebrationPhoto from "./CelebrationPhoto";
import ClinkBursts from "./ClinkBursts";
import Confetti from "./Confetti";
import GuestGlass from "./GuestGlass";
import GuestSeat from "./GuestSeat";
import ResponsiveCamera from "./ResponsiveCamera";
import Table, { TABLE_TOP_Y } from "./Table";
import TableSpace from "./TableSpace";

export type ToastSceneProps = {
  guests: PublicGuest[];
  meId: string;
  /** null dok real-time veza još nije javila stanje — tada sve prikazujemo kao online */
  live: LiveInfo | null;
  glassTargets: RefObject<GlassTargets>;
  clinkEvents: RefObject<ClinkEvent[]>;
  onMyGlassMove: (position: GlassPosition | null) => void;
  /** performance.now() početka pijenja (null = runda nije gotova) */
  revealStartedAt: number | null;
  photoUrl: string | null;
  photoRevealed: boolean;
};

function badgeFor(live: LiveInfo | null, guestId: string) {
  if (!live) return null;
  if (live.phase === "lobby" && live.ready.has(guestId)) return { icon: "🥂", label: "spreman" };
  if (live.phase === "toasting" && live.clinked.has(guestId)) return { icon: "✅", label: "kucnuo se" };
  return null;
}

export default function ToastScene({
  guests,
  meId,
  live,
  glassTargets,
  clinkEvents,
  onMyGlassMove,
  revealStartedAt,
  photoUrl,
  photoRevealed,
}: ToastSceneProps) {
  const myIndex = Math.max(0, guests.findIndex((g) => g.id === meId));
  const toasting = live?.phase === "toasting";
  const confettiAt =
    revealStartedAt !== null && revealStartedAt !== REVEAL_ALREADY_DONE ? revealStartedAt + DRINK_DURATION_MS : null;

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
      <spotLight position={[2.5, 6, 2]} angle={0.7} penumbra={0.8} intensity={45} color="#ffd9a8" />
      <pointLight position={[-3, 2, -2]} intensity={8} color="#8fb4ff" />

      {/* Lokalni environment (bez preuzimanja HDR-a) — daje refleksije na staklu */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#ffcf99" position={[4, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[3, 1, 1]} />
        <Lightformer form="rect" intensity={1} color="#9fc2ff" position={[-4, 1.5, 0]} rotation-y={Math.PI / 2} scale={[3, 1, 1]} />
      </Environment>

      <Table />

      {/* Svi gosti su u koordinatama stola; stol je zarotiran tako da sam "ja" najbliže kameri */}
      <TableSpace rotation={-seatAngle(myIndex, guests.length)}>
        {guests.map((guest, i) => {
          const angle = seatAngle(i, guests.length);
          const isMe = guest.id === meId;
          return (
            <group key={guest.id}>
              <GuestSeat
                guest={guest}
                angle={angle}
                isMe={isMe}
                offline={live !== null && !live.online.has(guest.id)}
                badge={badgeFor(live, guest.id)}
                showLabel={!photoRevealed}
              />
              <GuestGlass
                guest={guest}
                angle={angle}
                isMe={isMe}
                draggable={isMe && toasting}
                glassTargets={glassTargets}
                onMove={onMyGlassMove}
                revealStartedAt={revealStartedAt}
              />
            </group>
          );
        })}
        <ClinkBursts events={clinkEvents} />
      </TableSpace>

      <CelebrationPhoto url={photoUrl} revealed={photoRevealed} />
      <Confetti startAt={confettiAt} />

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
