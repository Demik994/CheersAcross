"use client";

/**
 * Most između 3D scene i pravog YouTube playera (DOM iframe).
 *
 * Video se ne može nacrtati kao tekstura (preglednik ne da čitati sliku iz YouTube iframea),
 * pa scena svaki frame javi gdje su na ekranu četiri kuta TV ekrana, a mi iframe
 * perspektivnom CSS transformacijom (matrix3d) "zalijepimo" točno na njih.
 */
export type Point = readonly [number, number];
/** gore lijevo, gore desno, dolje desno, dolje lijevo (px unutar sobe) */
export type ScreenQuad = readonly [Point, Point, Point, Point];

/** Stvarna CSS veličina iframea; transformacija ga skalira na TV ekran */
export const TV_ELEMENT_PX = 320;

export class TvScreenBridge {
  private element: HTMLElement | null = null;

  attach(element: HTMLElement) {
    this.element = element;
    element.style.visibility = "hidden";
  }

  detach(element: HTMLElement) {
    if (this.element === element) this.element = null;
  }

  /**
   * Scena javlja kutove TV ekrana svaki frame. null = ekran se ne smije vidjeti
   * (TV je iza kamere ili je slika slavlja ispred njega) — tada se vidi 3D ekran s naslovnom slikom.
   */
  place(quad: ScreenQuad | null) {
    const element = this.element;
    if (!element) return;
    if (!quad) {
      element.style.visibility = "hidden";
      return;
    }
    element.style.transform = quadTransform(quad);
    element.style.visibility = "visible";
  }
}

/**
 * CSS matrix3d koji kvadrat TV_ELEMENT_PX × TV_ELEMENT_PX (transform-origin 0 0)
 * preslika na zadani četverokut — projektivna transformacija (Heckbert, "square to quad").
 */
export function quadTransform(quad: ScreenQuad): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;

  let g = 0;
  let h = 0;
  if (dx3 !== 0 || dy3 !== 0) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;

  const s = TV_ELEMENT_PX;
  const m = [a / s, d / s, 0, g / s, b / s, e / s, 0, h / s, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`;
}
