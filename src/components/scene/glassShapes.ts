import { SplineCurve, Vector2 } from "three";
import type { GlassType } from "@/lib/drinks";

/**
 * Čaše su "tokarene" (LatheGeometry): definiramo samo 2D obris (radijus, visina)
 * koji se zavrti oko Y osi. Iz iste unutarnje linije radimo i stijenku stakla
 * i tekućinu, pa piće uvijek točno prati oblik čaše.
 */
type GlassShapeDef = {
  /** Vanjski obris od sredine dna do početka posude (podnožje, stapka) */
  base: [number, number][];
  /** Unutarnja linija posude, od sredine dna posude do ruba */
  inner: [number, number][];
  /** Glatka krivulja (kalež) ili ravne linije (krigla, čaša za sok) */
  smooth: boolean;
  wall: number;
  scale: number;
};

const SHAPES: Record<GlassType, GlassShapeDef> = {
  wine: {
    base: [[0, 0], [0.17, 0], [0.175, 0.008], [0.16, 0.016], [0.03, 0.035], [0.018, 0.08], [0.016, 0.38], [0.03, 0.46]],
    inner: [[0, 0.5], [0.12, 0.52], [0.2, 0.6], [0.235, 0.72], [0.225, 0.84], [0.2, 0.95]],
    smooth: true,
    wall: 0.012,
    scale: 1.4,
  },
  flute: {
    base: [[0, 0], [0.14, 0], [0.145, 0.008], [0.13, 0.016], [0.025, 0.035], [0.015, 0.08], [0.013, 0.4], [0.025, 0.47]],
    inner: [[0, 0.48], [0.05, 0.5], [0.085, 0.6], [0.1, 0.75], [0.1, 0.9], [0.094, 1.05]],
    smooth: true,
    wall: 0.01,
    scale: 1.35,
  },
  beer: {
    base: [[0, 0], [0.23, 0], [0.236, 0.02], [0.234, 0.06]],
    inner: [[0, 0.08], [0.2, 0.08], [0.2, 0.74]],
    smooth: false,
    wall: 0.03,
    scale: 1.3,
  },
  tumbler: {
    base: [[0, 0], [0.18, 0], [0.186, 0.012]],
    inner: [[0, 0.05], [0.172, 0.05], [0.205, 0.6]],
    smooth: false,
    wall: 0.014,
    scale: 1.35,
  },
  martini: {
    base: [[0, 0], [0.16, 0], [0.165, 0.008], [0.15, 0.016], [0.03, 0.035], [0.016, 0.08], [0.014, 0.5], [0.03, 0.54]],
    inner: [[0, 0.55], [0.3, 0.86]],
    smooth: false,
    wall: 0.012,
    scale: 1.35,
  },
  rakija: {
    base: [[0, 0], [0.085, 0], [0.09, 0.006], [0.075, 0.012], [0.02, 0.025], [0.012, 0.05], [0.012, 0.14], [0.022, 0.17]],
    inner: [[0, 0.18], [0.04, 0.19], [0.066, 0.25], [0.072, 0.33], [0.064, 0.42]],
    smooth: true,
    wall: 0.008,
    scale: 1.9,
  },
};

function sampleInner(def: GlassShapeDef): Vector2[] {
  const pts = def.inner.map(([x, y]) => new Vector2(x, y));
  if (def.smooth) return new SplineCurve(pts).getPoints(28);

  // Ravne linije podijelimo na više točaka da interpolacija tekućine bude precizna
  const out: Vector2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < 12; s++) out.push(pts[i].clone().lerp(pts[i + 1], s / 12));
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

function buildGlassProfile(def: GlassShapeDef, inner: Vector2[]): Vector2[] {
  const points = def.base.map(([x, y]) => new Vector2(x, y));
  const rim = inner[inner.length - 1];

  for (const p of inner) {
    if (p.x < 0.05) continue;
    points.push(new Vector2(p.x + def.wall, p.y - def.wall * 0.5));
  }
  points.push(new Vector2(rim.x + def.wall * 0.5, rim.y + def.wall * 0.3));

  for (let i = inner.length - 1; i >= 0; i--) points.push(inner[i].clone());
  return points;
}

function buildLiquidProfile(inner: Vector2[], fill: number): { points: Vector2[]; surfaceY: number; surfaceRadius: number } {
  const bottom = inner[0].y;
  const top = inner[inner.length - 1].y;
  const fillY = bottom + (top - bottom) * fill;
  const inset = 0.003;

  const points: Vector2[] = [];
  let surfaceRadius = 0;
  for (let i = 0; i < inner.length; i++) {
    const p = inner[i];
    if (p.y <= fillY) {
      points.push(new Vector2(Math.max(p.x - inset, 0), p.y + inset));
      surfaceRadius = Math.max(p.x - inset, 0);
      continue;
    }
    // Interpolacija radijusa točno na razini tekućine
    const prev = inner[i - 1];
    const t = (fillY - prev.y) / (p.y - prev.y);
    surfaceRadius = prev.x + (p.x - prev.x) * t - inset;
    points.push(new Vector2(surfaceRadius, fillY));
    break;
  }
  points.push(new Vector2(0, fillY)); // zatvara površinu tekućine
  return { points, surfaceY: fillY, surfaceRadius };
}

export type GlassGeometryData = {
  glass: Vector2[];
  liquid: Vector2[];
  surfaceY: number;
  surfaceRadius: number;
  /** Dno posude — tekućina se "prazni" skaliranjem prema ovoj visini */
  bottomY: number;
  rim: Vector2;
  scale: number;
};

const cache = new Map<string, GlassGeometryData>();

export function getGlassGeometry(type: GlassType, fill: number): GlassGeometryData {
  const key = `${type}:${fill}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const def = SHAPES[type];
  const inner = sampleInner(def);
  const liquid = buildLiquidProfile(inner, fill);
  const data: GlassGeometryData = {
    glass: buildGlassProfile(def, inner),
    liquid: liquid.points,
    surfaceY: liquid.surfaceY,
    surfaceRadius: liquid.surfaceRadius,
    bottomY: inner[0].y,
    rim: inner[inner.length - 1],
    scale: def.scale,
  };
  cache.set(key, data);
  return data;
}
