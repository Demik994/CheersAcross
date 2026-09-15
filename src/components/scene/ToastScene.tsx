"use client";

import type { RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { ChatBubbles, ClinkEvent, GlassTargets, LiveInfo } from "@/hooks/useLiveRoom";
import { drunkLevel } from "@/lib/drunk";
import { DRINK_DURATION_MS, REVEAL_ALREADY_DONE, seatAngle } from "@/lib/party/geometry";
import type { GlassPosition } from "@/lib/party/protocol";
import type { PublicGuest } from "@/lib/rooms/types";
import CameraRig, { DEFAULT_TARGET } from "./CameraRig";
import CelebrationPhoto from "./CelebrationPhoto";
import DrunkVision from "./DrunkVision";
import ClinkBursts from "./ClinkBursts";
import Confetti from "./Confetti";
import GuestGlass from "./GuestGlass";
import GuestSeat from "./GuestSeat";
import ResponsiveCamera from "./ResponsiveCamera";
import SceneTelevision, { type SceneTvProps } from "./SceneTelevision";
import { VOMIT_DURATION_MS } from "./VomitStream";
import Table, { TABLE_TOP_Y } from "./Table";
import TableSpace from "./TableSpace";

export type ToastSceneProps = {
  guests: PublicGuest[];
  meId: string;
  /** null dok real-time veza još nije javila stanje — tada sve prikazujemo kao online */
  live: LiveInfo | null;
  glassTargets: RefObject<GlassTargets>;
  clinkEvents: RefObject<ClinkEvent[]>;
  /** Poruke koje se trenutno prikazuju u oblačićima */
  bubbles: ChatBubbles;
  /** Glasnoća govora po gostu (0..1), mijenja se u pozadini */
  voiceLevels: ReadonlyMap<string, number>;
  onMyGlassMove: (position: GlassPosition | null) => void;
  /** performance.now() početka pijenja (null = runda nije gotova) */
  revealStartedAt: number | null;
  photoUrl: string | null;
  photoRevealed: boolean;
  /** Televizor s YouTube glazbom (null = ništa ne svira ili je glazba isključena) */
  tv: SceneTvProps | null;
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
  bubbles,
  voiceLevels,
  onMyGlassMove,
  revealStartedAt,
  photoUrl,
  photoRevealed,
  tv,
}: ToastSceneProps) {
  const myIndex = Math.max(0, guests.findIndex((g) => g.id === meId));
  const toasting = live?.phase === "toasting";
  const roundAnimated = revealStartedAt !== null && revealStartedAt !== REVEAL_ALREADY_DONE;
  const anyVomit = (live?.vomiting.size ?? 0) > 0;
  // Ako netko povraća, konfeti i slika dolaze tek nakon toga
  const confettiAt = roundAnimated ? revealStartedAt + DRINK_DURATION_MS + (anyVomit ? VOMIT_DURATION_MS : 0) : null;
  const levelOf = (id: string) => drunkLevel(live?.intoxication.get(id) ?? 0);
  // Tko je ušao nakon runde vidi samo lokvu, bez ponovnog mlaza
  const vomitAt = revealStartedAt === null ? null : roundAnimated ? revealStartedAt + DRINK_DURATION_MS + 200 : REVEAL_ALREADY_DONE;

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
                drunk={levelOf(guest.id)}
                bubble={bubbles.get(guest.id) ?? null}
                voice={live?.peers.find((p) => p.guestId === guest.id) ?? null}
                voiceLevels={voiceLevels}
                vomitStartedAt={live?.vomiting.has(guest.id) ? vomitAt : null}
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
      <CameraRig revealed={photoRevealed} watchTv={tv?.watching ?? false} />
      {/* Slika slavlja ne smije stajati ispred videa — dok je otkrivena, video je u kutu */}
      {tv && <SceneTelevision {...tv} hidden={photoRevealed} />}
      {/* Iscrtava scenu — s "pijanim" pogledom ako sam popio */}
      <DrunkVision level={levelOf(meId)} />
    </Canvas>
  );
}
