/**
 * Mjere starog CRT televizora — dijele ih 3D model i HTML (YouTube player, gumbi).
 *
 * Model se crta kosom (oblique) projekcijom: prednja strana ostaje ravna i 1 : 1 u pikselima,
 * pa pravi YouTube player (200 × 200 px, pravilo YouTubea) točno sjeda u rupu ekrana,
 * a bok i vrh kućišta se ipak vide. Jedinica modela = 100 px; (0, 0) je sredina ekrana.
 */
export const CRT_UNIT_PX = 100;
export const CRT_SCREEN_PX = 200;

export const CRT = {
  halfWidth: 1.18,
  top: 1.18,
  bottom: -1.52,
  feet: 0.08,
  depth: 0.9,
  /** Koliko se dubina "pomakne" u stranu/gore po jedinici dubine */
  shearX: 0.2,
  shearY: 0.2,
  antennaBaseZ: -0.55,
  antennaLength: 0.55,
  antennaSpread: 0.42,
  /** Traka ispod ekrana */
  stripY: -1.29,
  nameplate: { left: -1.0, right: 0.34, halfHeight: 0.13 },
  lampX: 0.48,
  knobs: [0.7, 0.98],
  knobRadius: 0.12,
} as const;

/** Rub oko modela u pikselima (da antialiasing ne odreže rubove) */
const MARGIN_PX = 4;

export type CrtSide = "left" | "right";

export type CrtLayout = {
  width: number;
  height: number;
  /** Gdje je sredina ekrana unutar platna (px od gornjeg lijevog kuta) */
  centerX: number;
  centerY: number;
  /** +1: dubina ide udesno (TV je lijevo pa "gleda" prema sredini), −1: ulijevo */
  depthDirection: 1 | -1;
};

export function crtLayout(side: CrtSide): CrtLayout {
  const u = CRT_UNIT_PX;
  const depthShiftX = CRT.depth * CRT.shearX * u;
  const antennaTop =
    CRT.top + CRT.antennaLength * Math.cos(CRT.antennaSpread) + 0.09 - CRT.antennaBaseZ * CRT.shearY;
  const top = Math.ceil(Math.max(CRT.top + CRT.depth * CRT.shearY, antennaTop) * u) + MARGIN_PX;
  const bottom = Math.ceil((-CRT.bottom + CRT.feet) * u) + MARGIN_PX;
  const near = Math.ceil(CRT.halfWidth * u) + MARGIN_PX;
  const far = Math.ceil(CRT.halfWidth * u + depthShiftX) + MARGIN_PX;
  const depthDirection = side === "left" ? 1 : -1;
  const left = depthDirection === 1 ? near : far;
  const right = depthDirection === 1 ? far : near;
  return { width: left + right, height: top + bottom, centerX: left, centerY: top, depthDirection };
}

/** Pravokutnik u koordinatama modela → CSS pozicija unutar platna */
export function crtRect(layout: CrtLayout, x0: number, y0: number, x1: number, y1: number) {
  return {
    left: layout.centerX + x0 * CRT_UNIT_PX,
    top: layout.centerY - y1 * CRT_UNIT_PX,
    width: (x1 - x0) * CRT_UNIT_PX,
    height: (y1 - y0) * CRT_UNIT_PX,
  };
}
