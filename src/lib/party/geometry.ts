/**
 * Geometrija stola u "koordinatama stola" (x, z) — ista za sve goste.
 * Koriste je i 3D scena (crtanje) i real-time server (prepoznavanje kucanja),
 * zato nema ovisnosti o Three.js-u.
 */
import type { GlassPosition } from "./protocol";

export const SEAT_RADIUS = 2.35;
const GLASS_RADIUS = 1.3;
const GLASS_SIDE_OFFSET = -0.18;

/** Čaše se "kucnu" kad su im središta bliže od ovoga */
export const CLINK_DISTANCE = 0.34;
/** Kad je gost sam za stolom, kucne se čašom u sredinu stola */
export const SOLO_CLINK_RADIUS = 0.35;
/** Trajanje animacije pijenja prije otkrivanja slike (ms) */
export const DRINK_DURATION_MS = 2800;
/** "Početak pijenja" za gosta koji uđe kad je slika već otkrivena — preskače animaciju */
export const REVEAL_ALREADY_DONE = -1e9;

/**
 * Kut mjesta za stolom. Svaki preglednik zatim zarotira cijeli stol tako da je
 * njegov gost najbliže kameri, pa pozicije čaša znače isto na svakom ekranu.
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

export function distance(a: GlassPosition, b: GlassPosition) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Udaljenost točke od dužine a→b — hvata i brz pokret između dvije poruke */
export function distanceToSegment(point: GlassPosition, a: GlassPosition, b: GlassPosition) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}
