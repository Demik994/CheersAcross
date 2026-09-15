"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { DRUNK_LEVELS, type DrunkLevel } from "@/lib/drunk";
import type { Peer } from "@/lib/party/protocol";
import type { PublicGuest } from "@/lib/rooms/types";
import Character from "./Character";
import { SEAT_RADIUS, angleDelta } from "@/lib/party/geometry";
import { TABLE_TOP_Y } from "./Table";
import { STUNT, lyingHeadInSeatSpace } from "./tableStunt";

const LYING_HEAD = lyingHeadInSeatSpace();

type Props = {
  guest: PublicGuest;
  /** Kut mjesta u koordinatama stola */
  angle: number;
  isMe: boolean;
  offline: boolean;
  /** Oznaka uz ime: 🥂 spreman (prije nazdravljanja), ✅ kucnuo se (tijekom) */
  badge: { icon: string; label: string } | null;
  /** HTML oznake se crtaju iznad canvasa — skrivamo ih dok je slika otkrivena */
  showLabel: boolean;
  drunk: DrunkLevel;
  vomitStartedAt: number | null;
  /** penje se na stol i pada (performance.now() početka) */
  stuntStartedAt: number | null;
  /** leži na podu */
  lying: boolean;
  bubble: { text: string; id: number } | null;
  /** null = gost nije spojen */
  voice: Peer | null;
  voiceLevels: ReadonlyMap<string, number>;
};

/**
 * Jedno mjesto za stolom: čovječuljak i ime iznad glave.
 * Kad netko uđe ili izađe, mjesta se preraspodijele — lik glatko "klizi" oko stola.
 */
export default function GuestSeat({
  guest,
  angle,
  isMe,
  offline,
  badge,
  showLabel,
  drunk,
  vomitStartedAt,
  stuntStartedAt,
  lying,
  bubble,
  voice,
  voiceLevels,
}: Props) {
  // Oznaka i oblačić prate glavu kad lik leži — od trenutka kad padne na pod
  const [landedAt, setLandedAt] = useState<number | null>(null);
  useEffect(() => {
    if (stuntStartedAt === null) return;
    const timer = setTimeout(() => setLandedAt(stuntStartedAt), Math.max(0, stuntStartedAt + STUNT.landAt - performance.now()));
    return () => clearTimeout(timer);
  }, [stuntStartedAt]);
  const onFloor = lying && (stuntStartedAt === null || landedAt === stuntStartedAt);
  const pivotRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  /** Glasnoća govora 0..1 — Character po njoj otvara usta */
  const talk = useRef(0);

  useFrame((_, delta) => {
    // Govor: usta i zeleni prsten oko ramena
    talk.current = MathUtils.damp(talk.current, voiceLevels.get(guest.id) ?? 0, 14, delta);
    const ring = ringRef.current;
    if (ring) {
      ring.visible = talk.current > 0.04;
      (ring.material as MeshBasicMaterial).opacity = Math.min(0.9, talk.current * 1.6);
      ring.scale.setScalar(1 + talk.current * 0.25);
    }

    const pivot = pivotRef.current;
    if (!pivot) return;
    const diff = angleDelta(pivot.rotation.y, angle);
    if (Math.abs(diff) < 0.0005) return;
    pivot.rotation.y = MathUtils.damp(pivot.rotation.y, pivot.rotation.y + diff, 4, delta);
  });

  return (
    <group ref={pivotRef} rotation-y={angle}>
      {/* rotation π: lice lika (+Z) gleda prema sredini stola */}
      <Character
        seed={guest.id}
        avatar={guest.avatar}
        skin={guest.skin}
        color={offline ? "#6f6a66" : guest.color}
        sleepy={offline}
        drunk={drunk}
        vomitStartedAt={vomitStartedAt}
        stuntStartedAt={stuntStartedAt}
        lying={lying}
        talkRef={talk}
        position={[0, TABLE_TOP_Y, SEAT_RADIUS]}
        rotation-y={Math.PI}
      />

      {/* Prsten dok gost priča */}
      <mesh ref={ringRef} position={[0, TABLE_TOP_Y + 0.3, SEAT_RADIUS]} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.34, 0.4, 40]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0} depthWrite={false} />
      </mesh>

      {bubble && showLabel && (
        <Html
          position={
            onFloor
              ? [LYING_HEAD[0], LYING_HEAD[1] + 0.55, LYING_HEAD[2]]
              : isMe
                ? [0, TABLE_TOP_Y + 1.02, SEAT_RADIUS]
                : [0, TABLE_TOP_Y + 1.12, SEAT_RADIUS + 0.05]
          }
          zIndexRange={[7, 1]}
          style={{ pointerEvents: "none" }}
        >
          {/* Dno oblačića (vrh "repa") je na točki iznad glave */}
          <div key={bubble.id} className="chat-bubble -translate-x-1/2 -translate-y-full pb-2">
            <div className="relative w-max max-w-44 rounded-2xl bg-white px-3 py-1.5 text-center text-sm leading-snug font-medium break-words whitespace-normal text-stone-900 shadow-xl">
              {bubble.text}
              <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-white" aria-hidden />
            </div>
          </div>
        </Html>
      )}

      {showLabel && (
      <Html
        // Svoju oznaku gledam s leđa lika — pomaknuta je u stranu da ne skriva moju (možda sitnu) čašu
        position={
          onFloor
            ? [LYING_HEAD[0], LYING_HEAD[1] + 0.4, LYING_HEAD[2]]
            : isMe
              ? [-0.62, TABLE_TOP_Y + 0.55, SEAT_RADIUS + 0.1]
              : [0, TABLE_TOP_Y + 0.92, SEAT_RADIUS + 0.05]
        }
        center
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-lg transition-opacity ${
            isMe ? "bg-amber-300 text-stone-900" : "bg-stone-900/80 text-stone-50"
          } ${offline ? "opacity-60" : ""}`}
          style={isMe ? undefined : { boxShadow: `inset 0 0 0 1.5px ${offline ? "#6f6a66" : guest.color}` }}
        >
          {guest.isHost && <span aria-label="domaćin">👑</span>}
          {guest.name}
          {isMe && <span className="font-normal opacity-70">(ti)</span>}
          {badge && <span aria-label={badge.label}>{badge.icon}</span>}
          {drunk > 0 && <span aria-label={DRUNK_LEVELS[drunk].label}>{DRUNK_LEVELS[drunk].emoji}</span>}
          {offline && <span aria-label="nije spojen">💤</span>}
          {voice && !voice.mic && <span aria-label="piše umjesto govora">⌨️</span>}
          {voice?.mic && voice.muted && <span aria-label="utišan">🔇</span>}
        </div>
      </Html>
      )}
    </group>
  );
}
