/**
 * Vertical text layout — fits translated text into a polygon.
 *
 * - **CJK text**: stacks characters top-to-bottom in right-to-left columns,
 *   using scanline intersection for polygon-aware column heights.
 * - **Non-CJK text** (English etc.): renders horizontally but rotated 90° CW
 *   within the polygon, since vertically stacked Latin letters are unreadable.
 *   The SVG renderer applies `transform="rotate(90, cx, cy)"` on the text group.
 */

import type { PolyBounds } from "./polygonGeometry.ts";
import { polygonSpanAtX, isCjk } from "./polygonGeometry.ts";
import { fitHorizontal } from "./horizontalLayout.ts";
import type { HorizontalLayout, HorizontalLayoutRow } from "./horizontalLayout.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerticalLayoutColumn {
  chars: string;
  x: number;
  startY: number;
}

/** CJK vertical: individual characters stacked in columns */
export interface VerticalCjkLayout {
  kind: "vertical";
  subKind: "cjk";
  fontSize: number;
  columns: VerticalLayoutColumn[];
  columnWidth: number;
}

/**
 * Non-CJK vertical: horizontal text rotated 90° CW.
 * The renderer should apply a rotation transform around (cx, cy) of the polygon bounds.
 */
export interface VerticalRotatedLayout {
  kind: "vertical";
  subKind: "rotated";
  fontSize: number;
  rows: HorizontalLayoutRow[];
  lineHeight: number;
  /** Rotation origin */
  rotateCx: number;
  rotateCy: number;
}

export type VerticalLayout = VerticalCjkLayout | VerticalRotatedLayout;

// ── CJK vertical layout ─────────────────────────────────────────────────────

function layoutVerticalCjk(
  text: string,
  fontSize: number,
  polygon: [number, number][],
  bounds: PolyBounds,
): VerticalLayoutColumn[] | null {
  const colW = fontSize * 1.1;
  const charH = fontSize * 1.1;
  const flat = text.replace(/\n/g, "");
  if (flat.length === 0) return [{ chars: "", x: bounds.cx, startY: bounds.cy }];

  const padX = fontSize * 0.4;
  const availableW = bounds.w - padX * 2;
  const maxCols = Math.floor(availableW / colW);
  if (maxCols < 1) return null;

  const totalW = Math.min(maxCols, Math.ceil(flat.length)) * colW;
  // Columns flow right-to-left; rightmost column x
  const startX = bounds.cx + totalW / 2 - colW / 2;

  const columns: VerticalLayoutColumn[] = [];
  let remaining = flat;

  for (let colIdx = 0; colIdx < maxCols && remaining.length > 0; colIdx++) {
    const colX = startX - colIdx * colW;
    const span = polygonSpanAtX(polygon, colX);
    if (!span) continue;

    const padY = fontSize * 0.4;
    const colHeight = (span.bottom - span.top) - padY * 2;
    const charsPerCol = Math.max(1, Math.floor(colHeight / charH));
    const colStartY = span.top + padY + fontSize;

    const chunk = remaining.slice(0, charsPerCol);
    columns.push({ chars: chunk, x: colX, startY: colStartY });
    remaining = remaining.slice(chunk.length);
  }

  if (remaining.length > 0) return null;
  if (columns.length === 0) return null;
  return columns;
}

function fitVerticalCjk(
  text: string,
  polygon: [number, number][],
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): VerticalCjkLayout {
  let lo = minSize, hi = maxSize, bestSize = minSize;
  let bestCols: VerticalLayoutColumn[] = [{ chars: text, x: bounds.cx, startY: bounds.cy }];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cols = layoutVerticalCjk(text, mid, polygon, bounds);
    if (cols) {
      bestSize = mid;
      bestCols = cols;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { kind: "vertical", subKind: "cjk", fontSize: bestSize, columns: bestCols, columnWidth: bestSize * 1.1 };
}

// ── Non-CJK vertical (rotated horizontal) ───────────────────────────────────

/**
 * For non-CJK text in a vertical polygon, we treat the polygon as if it were
 * rotated 90° CCW (swap width↔height), lay out text horizontally in that
 * rotated space, then tell the SVG renderer to rotate the text group 90° CW.
 *
 * This makes English text readable in tall/narrow speech bubbles.
 */
function fitVerticalRotated(
  text: string,
  polygon: [number, number][],
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): VerticalRotatedLayout {
  // Rotate polygon 90° CCW around its centre for layout purposes
  const { cx, cy } = bounds;
  const rotatedPoly: [number, number][] = polygon.map(([px, py]) => {
    // 90° CCW: (x,y) → (y, -x) relative to centre
    const dx = px - cx;
    const dy = py - cy;
    return [cx + dy, cy - dx] as [number, number];
  });

  // Fit horizontally in the rotated polygon
  const hLayout: HorizontalLayout = fitHorizontal(text, rotatedPoly, bounds, minSize, maxSize);

  return {
    kind: "vertical",
    subKind: "rotated",
    fontSize: hLayout.fontSize,
    rows: hLayout.rows,
    lineHeight: hLayout.lineHeight,
    rotateCx: cx,
    rotateCy: cy,
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function fitVertical(
  text: string,
  polygon: [number, number][],
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): VerticalLayout {
  if (isCjk(text)) {
    return fitVerticalCjk(text, polygon, bounds, minSize, maxSize);
  }
  return fitVerticalRotated(text, polygon, bounds, minSize, maxSize);
}
