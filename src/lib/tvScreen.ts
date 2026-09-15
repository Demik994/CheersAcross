"use client";

/**
 * Most između 3D scene i pravog YouTube playera (DOM iframe).
 *
 * Video se ne može nacrtati kao tekstura (preglednik ne da čitati sliku iz YouTube iframea),
 * pa scena svaki frame javi gdje su na ekranu četiri kuta TV ekrana, a mi iframe
 * perspektivnom CSS transformacijom (matrix3d) "zalijepimo" točno na njih.
 *
 * YouTube traži da player bude vidljiv, barem 200 × 200 px i da ništa ne stoji ispred njega.
 * Kad TV ekran to ne ispunjava (premalen, izvan kadra, ispod gornjih/donjih kontrola,
 * ili je slika slavlja ispred), video odleti u mali ekran u kutu i vrati se kad može.
 */
export type Point = readonly [number, number];
/** gore lijevo, gore desno, dolje desno, dolje lijevo (px unutar sobe) */
export type ScreenQuad = readonly [Point, Point, Point, Point];
export type TvMode = "scene" | "dock";

/** Stvarna CSS veličina iframea; transformacija ga skalira na TV ekran */
export const TV_ELEMENT_PX = 320;
const MIN_SIDE_PX = 200;
/** Za ulazak na TV tražimo malo više, da ne titra na granici */
const ENTER_SIDE_PX = 208;
const ENTER_DELAY_MS = 350;
const DOCK_PX = 200;
const DOCK_MARGIN_PX = 12;
const MOVE_TRANSITION_MS = 450;
const BOUNDS_REFRESH_MS = 300;

type Bounds = { top: number; bottom: number; width: number; height: number };

export class TvScreenBridge {
  private element: HTMLElement | null = null;
  private mode: TvMode = "dock";
  private enterSince: number | null = null;
  private bounds: Bounds | null = null;
  private boundsAt = 0;
  private transitionTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  /** Za useSyncExternalStore: je li video trenutno na televizoru ili u kutu */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getMode = (): TvMode => this.mode;

  attach(element: HTMLElement) {
    this.element = element;
    this.setMode("dock");
    this.enterSince = null;
    this.bounds = null;
    this.applyDock();
  }

  detach(element: HTMLElement) {
    if (this.element === element) this.element = null;
    clearTimeout(this.transitionTimer);
  }

  /** Scena javlja kutove TV ekrana (null = TV se ne vidi) — poziva se svaki frame */
  place(quad: ScreenQuad | null) {
    const element = this.element;
    if (!element) return;
    const now = performance.now();
    const bounds = this.readBounds(now);

    if (this.mode === "scene") {
      if (quad && this.fits(quad, bounds, MIN_SIDE_PX)) {
        element.style.transform = quadTransform(quad);
        return;
      }
      // Izlazimo odmah — ni jedan frame ne smije biti premalen ili prekriven
      this.switchTo("dock");
      this.applyDock();
      return;
    }

    if (quad && this.fits(quad, bounds, ENTER_SIDE_PX)) {
      this.enterSince ??= now;
      if (now - this.enterSince >= ENTER_DELAY_MS) {
        this.switchTo("scene");
        element.style.transform = quadTransform(quad);
        return;
      }
    } else {
      this.enterSince = null;
    }
    this.applyDock();
  }

  private switchTo(mode: TvMode) {
    const element = this.element;
    if (!element || this.mode === mode) return;
    this.setMode(mode);
    this.enterSince = null;
    element.dataset.mode = mode;
    element.style.transition = `transform ${MOVE_TRANSITION_MS}ms ease-in-out`;
    clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      if (this.element) this.element.style.transition = "";
    }, MOVE_TRANSITION_MS);
  }

  private setMode(mode: TvMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.listeners.forEach((listener) => listener());
  }

  private applyDock() {
    const element = this.element;
    if (!element) return;
    const bounds = this.readBounds(performance.now());
    const left = bounds.width - DOCK_PX - DOCK_MARGIN_PX;
    const top = bounds.top + DOCK_MARGIN_PX;
    element.dataset.mode = "dock";
    element.style.transform = quadTransform([
      [left, top],
      [left + DOCK_PX, top],
      [left + DOCK_PX, top + DOCK_PX],
      [left, top + DOCK_PX],
    ]);
  }

  private fits(quad: ScreenQuad, bounds: Bounds, minSide: number) {
    for (const [x, y] of quad) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (x < 0 || x > bounds.width || y < bounds.top || y > bounds.bottom) return false;
    }
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i];
      const [bx, by] = quad[(i + 1) % 4];
      if (Math.hypot(bx - ax, by - ay) < minSide) return false;
    }
    return true;
  }

  /** Slobodni prostor između gornjih gumba i donjeg panela (označeni s data-tv-bound) */
  private readBounds(now: number): Bounds {
    if (this.bounds && now - this.boundsAt < BOUNDS_REFRESH_MS) return this.bounds;
    const room = this.element?.offsetParent as HTMLElement | null;
    const roomRect = room?.getBoundingClientRect();
    const width = roomRect?.width ?? window.innerWidth;
    const height = roomRect?.height ?? window.innerHeight;
    const originY = roomRect?.top ?? 0;
    const top = room?.querySelector("[data-tv-bound=top]")?.getBoundingClientRect().bottom;
    const bottom = room?.querySelector("[data-tv-bound=bottom]")?.getBoundingClientRect().top;
    this.bounds = {
      width,
      height,
      top: top === undefined ? 0 : top - originY + 4,
      bottom: bottom === undefined ? height : bottom - originY - 4,
    };
    this.boundsAt = now;
    return this.bounds;
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
