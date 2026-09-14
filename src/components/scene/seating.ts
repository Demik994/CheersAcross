import type { GlassPosition } from "@/lib/party/protocol";

export const SEAT_RADIUS = 2.35;
const GLASS_RADIUS = 1.3;
const GLASS_SIDE_OFFSET = -0.18;

/**
 * Kut mjesta za stolom u "koordinatama stola" — isti za sve goste.
 * Svaki preglednik zatim zarotira cijeli stol tako da je njegov gost najbliže kameri,
 * pa pozicije čaša koje šalje real-time server znače isto na svakom ekranu.
 */
export function seatAngle(index: number, count: number) {
  return (index / Math.max(count, 1)) * Math.PI * 2;
}

/** Gdje čaša stoji kad je gost ne drži (ispred njega, malo u stranu) */
export function glassRestPosition(angle: number): GlassPosition {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    x: GLASS_SIDE_OFFSET * cos + GLASS_RADIUS * sin,
    z: -GLASS_SIDE_OFFSET * sin + GLASS_RADIUS * cos,
  };
}

/** Najkraća razlika kutova (-π..π) — za glatko okretanje bez "punog kruga" */
export function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
