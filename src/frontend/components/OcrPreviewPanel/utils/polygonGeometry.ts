/**
 * Low-level polygon geometry helpers: bounding box, scanline intersection,
 * text measurement, and CJK detection.
 */

// ── Bounding box ─────────────────────────────────────────────────────────────

export interface PolyBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export function polyBounds(polygon: [number, number][]): PolyBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of polygon) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return { x: minX, y: minY, w, h, cx: minX + w / 2, cy: minY + h / 2 };
}

// ── Scanline intersection ────────────────────────────────────────────────────

/**
 * Compute the horizontal span inside `polygon` at a given Y coordinate.
 * Returns `{ left, right }` representing the usable X range, or null if Y
 * is outside the polygon.
 */
export function polygonSpanAtY(polygon: [number, number][], y: number): { left: number; right: number } | null {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    if ((ay <= y && by > y) || (by <= y && ay > y)) {
      const t = (y - ay) / (by - ay);
      xs.push(ax + t * (bx - ax));
    }
  }
  if (xs.length < 2) return null;
  xs.sort((a, b) => a - b);
  return { left: xs[0], right: xs[xs.length - 1] };
}

/**
 * Compute the vertical span inside `polygon` at a given X coordinate.
 * Returns `{ top, bottom }` representing the usable Y range, or null if X
 * is outside the polygon.
 */
export function polygonSpanAtX(polygon: [number, number][], x: number): { top: number; bottom: number } | null {
  const ys: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    if ((ax <= x && bx > x) || (bx <= x && ax > x)) {
      const t = (x - ax) / (bx - ax);
      ys.push(ay + t * (by - ay));
    }
  }
  if (ys.length < 2) return null;
  ys.sort((a, b) => a - b);
  return { top: ys[0], bottom: ys[ys.length - 1] };
}

// ── Text measurement helpers ─────────────────────────────────────────────────

/** Returns true if the text is predominantly CJK (>50% CJK characters). */
export function isCjk(text: string): boolean {
  let cjk = 0;
  let total = 0;
  for (const ch of text) {
    if (ch.trim() === "") continue;
    total++;
    if (ch.charCodeAt(0) > 0x2E7F) cjk++;
  }
  return total > 0 && cjk / total > 0.5;
}

/** Estimate text width in pixels. CJK ≈ 1em, ASCII ≈ 0.6em. */
export function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 0x2E7F ? fontSize : fontSize * 0.6;
  }
  return w;
}
