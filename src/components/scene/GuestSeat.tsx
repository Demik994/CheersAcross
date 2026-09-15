"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, type Group } from "three";
import { DRUNK_LEVELS, type DrunkLevel } from "@/lib/drunk";
import type { PublicGuest } from "@/lib/rooms/types";
import Character from "./Character";
import { SEAT_RADIUS, angleDelta } from "@/lib/party/geometry";
import { TABLE_TOP_Y } from "./Table";

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
};

/**
 * Jedno mjesto za stolom: čovječuljak i ime iznad glave.
 * Kad netko uđe ili izađe, mjesta se preraspodijele — lik glatko "klizi" oko stola.
 */
export default function GuestSeat({ guest, angle, isMe, offline, badge, showLabel, drunk, vomitStartedAt }: Props) {
  const pivotRef = useRef<Group>(null);

  useFrame((_, delta) => {
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
        position={[0, TABLE_TOP_Y, SEAT_RADIUS]}
        rotation-y={Math.PI}
      />

      {showLabel && (
      <Html
        // Svoju oznaku gledam s leđa lika — pomaknuta je u stranu da ne skriva moju (možda sitnu) čašu
        position={isMe ? [-0.62, TABLE_TOP_Y + 0.55, SEAT_RADIUS + 0.1] : [0, TABLE_TOP_Y + 0.92, SEAT_RADIUS + 0.05]}
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
        </div>
      </Html>
      )}
    </group>
  );
}
