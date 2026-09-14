"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, type Group } from "three";
import type { PublicGuest } from "@/lib/rooms/types";
import Character from "./Character";
import Glass from "./Glass";
import { TABLE_TOP_Y } from "./Table";

export const SEAT_RADIUS = 2.35;
const GLASS_RADIUS = 1.3;

type Props = {
  guest: PublicGuest;
  /** Kut oko stola; 0 = mjesto najbliže kameri */
  angle: number;
  isMe: boolean;
};

/**
 * Jedno mjesto za stolom: čovječuljak, njegova čaša i ime iznad glave.
 * Kad netko uđe ili izađe, mjesta se preraspodijele — lik glatko "klizi"
 * oko stola umjesto da skoči.
 */
export default function GuestSeat({ guest, angle, isMe }: Props) {
  const pivotRef = useRef<Group>(null);

  useFrame((_, delta) => {
    const pivot = pivotRef.current;
    if (!pivot) return;
    // Najkraći put do ciljnog kuta
    const diff = Math.atan2(Math.sin(angle - pivot.rotation.y), Math.cos(angle - pivot.rotation.y));
    if (Math.abs(diff) < 0.0005) return;
    pivot.rotation.y = MathUtils.damp(pivot.rotation.y, pivot.rotation.y + diff, 4, delta);
  });

  return (
    <group ref={pivotRef} rotation-y={angle}>
      {/* rotation π: lice lika (+Z) gleda prema sredini stola */}
      <Character seed={guest.id} color={guest.color} position={[0, TABLE_TOP_Y, SEAT_RADIUS]} rotation-y={Math.PI} />
      <Glass key={guest.drink} drink={guest.drink} position={[-0.18, TABLE_TOP_Y, GLASS_RADIUS]} scale={0.72} />

      <Html
        position={[0, TABLE_TOP_Y + 0.92, SEAT_RADIUS + 0.05]}
        center
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-lg ${
            isMe ? "bg-amber-300 text-stone-900" : "bg-stone-900/80 text-stone-50"
          }`}
          style={isMe ? undefined : { boxShadow: `inset 0 0 0 1.5px ${guest.color}` }}
        >
          {guest.isHost && <span aria-label="domaćin">👑</span>}
          {guest.name}
          {isMe && <span className="font-normal opacity-70">(ti)</span>}
        </div>
      </Html>
    </group>
  );
}
