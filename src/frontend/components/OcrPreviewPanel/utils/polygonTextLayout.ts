/**
 * Utilities for fitting translated text inside an OCR polygon.
 *
 * Strategy:
 *  - Compute the AABB (axis-aligned bounding box) of the polygon.
 *  - For horizontal lines: wrap text into rows, binary-search for the largest
 *    font size where all rows fit within the bounding box width/height.
 *  - For vertical lines: stack characters top-to-bottom in columns, binary-
 *    search for the largest font size where all columns fit.
 *
 * The caller renders the result as SVG <text> / <tspan> elements, clipped by
 * a <clipPath> derived from the polygon so characters never escape.
 */

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

// ── Horizontal layout ────────────────────────────────────────────────────────

export interface HorizontalLayout {
  kind: "horizontal";
  fontSize: number;
  lines: string[];
  lineHeight: number;
  /** top-left anchor y of the first line's baseline */
  startY: number;
  /** centre x for each row */
  cx: number;
}

/**
 * Wrap `text` into lines that each fit within `maxWidth` at `fontSize` px.
 * CJK chars ≈ 1 em wide; ASCII chars ≈ 0.6 em wide (rough approximation).
 */
function wrapHorizontal(text: string, fontSize: number, maxWidth: number): string[] {
  const rows: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") { rows.push(""); continue; }
    let current = "";
    let currentW = 0;
    for (const ch of paragraph) {
      const charW = ch.charCodeAt(0) > 0x2E7F ? fontSize : fontSize * 0.6;
      if (currentW + charW > maxWidth + 0.5 && current !== "") {
        rows.push(current);
        current = ch;
        currentW = charW;
      } else {
        current += ch;
        currentW += charW;
      }
    }
    if (current) rows.push(current);
  }
  return rows.length ? rows : [""];
}

export function fitHorizontal(
  text: string,
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): HorizontalLayout {
  let lo = minSize, hi = maxSize, bestSize = minSize;
  let bestLines: string[] = [text];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lineHeight = mid * 1.2;
    const lines = wrapHorizontal(text, mid, bounds.w * 0.96);
    const totalH = lines.length * lineHeight;
    if (totalH <= bounds.h * 0.98) {
      bestSize = mid;
      bestLines = lines;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const lineHeight = bestSize * 1.2;
  const totalH = bestLines.length * lineHeight;
  const startY = bounds.cy - totalH / 2 + lineHeight * 0.8; // first baseline

  return { kind: "horizontal", fontSize: bestSize, lines: bestLines, lineHeight, startY, cx: bounds.cx };
}

// ── Vertical layout ──────────────────────────────────────────────────────────

export interface VerticalLayout {
  kind: "vertical";
  fontSize: number;
  columns: string[];
  columnWidth: number;
  /** x of the RIGHT edge of the first (rightmost) column */
  startX: number;
  /** top y of first character */
  startY: number;
}

/**
 * Split text into columns that each fit within `maxHeight` at `fontSize` px.
 * Characters in a vertical column are ≈ 1 em tall.
 * Columns are filled right-to-left (traditional vertical).
 */
function wrapVertical(text: string, fontSize: number, maxHeight: number): string[] {
  const cols: string[] = [];
  const charsPerCol = Math.max(1, Math.floor(maxHeight / (fontSize * 1.1)));
  // flatten (drop explicit newlines for vertical — they become column breaks)
  const flat = text.replace(/\n/g, "");
  for (let i = 0; i < flat.length; i += charsPerCol) {
    cols.push(flat.slice(i, i + charsPerCol));
  }
  return cols.length ? cols : [""];
}

export function fitVertical(
  text: string,
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): VerticalLayout {
  let lo = minSize, hi = maxSize, bestSize = minSize;
  let bestCols: string[] = [text];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const colW = mid * 1.1;
    const cols = wrapVertical(text, mid, bounds.h * 0.96);
    const totalW = cols.length * colW;
    if (totalW <= bounds.w * 0.98) {
      bestSize = mid;
      bestCols = cols;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const colW = bestSize * 1.1;
  const totalW = bestCols.length * colW;
  // Columns flow right-to-left; start at right side of bbox centre
  const startX = bounds.cx + totalW / 2 - colW / 2;
  const startY = bounds.y + bounds.h * 0.02 + bestSize; // top-left of first char baseline

  return { kind: "vertical", fontSize: bestSize, columns: bestCols, columnWidth: colW, startX, startY };
}

export type PolygonTextLayout = HorizontalLayout | VerticalLayout;

export function fitTextInPolygon(
  text: string,
  polygon: [number, number][],
  orientation: "horizontal" | "vertical",
): PolygonTextLayout {
  const bounds = polyBounds(polygon);
  if (orientation === "vertical") return fitVertical(text, bounds);
  return fitHorizontal(text, bounds);
}
