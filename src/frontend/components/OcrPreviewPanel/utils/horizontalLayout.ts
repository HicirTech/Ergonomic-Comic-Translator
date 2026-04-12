/**
 * Horizontal text layout — fits translated text into a polygon using scanline
 * intersection so each row adapts to the polygon's actual width.
 *
 * For non-CJK text, wraps at word boundaries for natural line breaks.
 */

import type { PolyBounds } from "./polygonGeometry.ts";
import { polygonSpanAtY, isCjk, measureText } from "./polygonGeometry.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface HorizontalLayoutRow {
  text: string;
  cx: number;
  y: number;
}

export interface HorizontalLayout {
  kind: "horizontal";
  fontSize: number;
  rows: HorizontalLayoutRow[];
  lineHeight: number;
}

// ── Wrapping helpers ─────────────────────────────────────────────────────────

/**
 * Consume one row's worth of characters from `text` that fits within `maxWidth`.
 * Returns the consumed text (empty string if nothing fits).
 */
function consumeCharRow(text: string, fontSize: number, maxWidth: number): string {
  let row = "";
  let w = 0;
  for (const ch of text) {
    const charW = ch.charCodeAt(0) > 0x2E7F ? fontSize : fontSize * 0.6;
    if (w + charW > maxWidth + 0.5 && row !== "") break;
    row += ch;
    w += charW;
  }
  return row;
}

/**
 * Consume one row's worth of words from `text` that fits within `maxWidth`.
 * Returns the consumed text (empty string if nothing fits).
 */
function consumeWordRow(text: string, fontSize: number, maxWidth: number): string {
  const words = text.match(/\S+/g);
  if (!words) return "";
  let row = "";
  let w = 0;
  for (const word of words) {
    const wordW = measureText(word, fontSize);
    const spaceW = row === "" ? 0 : fontSize * 0.6;
    if (w + spaceW + wordW > maxWidth + 0.5 && row !== "") break;
    row = row === "" ? word : row + " " + word;
    w += spaceW + wordW;
  }
  return row;
}

// ── Core layout ──────────────────────────────────────────────────────────────

/**
 * Lay out text into rows that follow the polygon shape via scanline.
 *
 * **Algorithm**:
 * 1. Scan from polygon top to bottom in `lineHeight` steps to find all
 *    Y positions where the polygon has usable width.
 * 2. Filter to rows that are wide enough for at least one character.
 * 3. Distribute text greedily into those rows (each row gets as much text
 *    as fits its polygon-width at that Y).
 * 4. Centre the used rows vertically within the available vertical band.
 *
 * Returns null if the text doesn't fit (font too large).
 */
function layoutHorizontal(
  text: string,
  fontSize: number,
  polygon: [number, number][],
  bounds: PolyBounds,
): HorizontalLayoutRow[] | null {
  const lineHeight = fontSize * 1.2;
  const useCjk = isCjk(text);
  const insetY = lineHeight * 0.1; // small top/bottom padding
  const minY = bounds.y + insetY + fontSize; // first possible baseline
  const maxY = bounds.y + bounds.h - insetY;

  // 1. Build list of candidate slots (Y positions with usable width)
  interface Slot { y: number; width: number; cx: number }
  const slots: Slot[] = [];
  for (let y = minY; y <= maxY; y += lineHeight) {
    const span = polygonSpanAtY(polygon, y - fontSize * 0.3); // sample near vertical centre of row
    if (!span) continue;
    const w = (span.right - span.left) * 0.94; // 6% total inset
    if (w < fontSize * 0.6) continue; // too narrow for even one character
    slots.push({ y, width: w, cx: (span.left + span.right) / 2 });
  }
  if (slots.length === 0) return null;

  // 2. Flatten text (collapse newlines)
  let remaining = text.replace(/\n/g, useCjk ? "" : " ").trim();
  if (remaining.length === 0) return [{ text: "", cx: bounds.cx, y: bounds.cy }];

  // 3. Greedily fill slots
  const usedRows: HorizontalLayoutRow[] = [];
  for (const slot of slots) {
    if (remaining.length === 0) break;
    const rowText = useCjk
      ? consumeCharRow(remaining, fontSize, slot.width)
      : consumeWordRow(remaining, fontSize, slot.width);
    if (rowText === "") continue;
    usedRows.push({ text: rowText, cx: slot.cx, y: slot.y });
    remaining = remaining.slice(rowText.length).trim();
  }

  if (remaining.length > 0) return null; // didn't fit
  if (usedRows.length === 0) return null;

  // 4. Centre vertically: shift rows so they sit in the middle of the polygon
  const firstY = usedRows[0].y;
  const lastY = usedRows[usedRows.length - 1].y;
  const textBandH = lastY - firstY + lineHeight;
  const polygonMidY = bounds.cy;
  const textMidY = firstY + textBandH / 2 - lineHeight * 0.2;
  const shift = polygonMidY - textMidY;

  // Only shift if the shifted rows still land inside the polygon
  const shiftedFirst = firstY + shift;
  const shiftedLast = lastY + shift;
  if (shiftedFirst >= bounds.y && shiftedLast <= bounds.y + bounds.h) {
    // Re-check each shifted Y is still inside the polygon and re-compute cx
    const shiftedRows: HorizontalLayoutRow[] = [];
    let reRemaining = text.replace(/\n/g, useCjk ? "" : " ").trim();
    for (const row of usedRows) {
      const newY = row.y + shift;
      const span = polygonSpanAtY(polygon, newY - fontSize * 0.3);
      if (!span) {
        // Shifted position is outside polygon — abort shift
        return usedRows;
      }
      const w = (span.right - span.left) * 0.94;
      const cx = (span.left + span.right) / 2;
      const rowText = useCjk
        ? consumeCharRow(reRemaining, fontSize, w)
        : consumeWordRow(reRemaining, fontSize, w);
      if (rowText === "") return usedRows; // abort shift
      shiftedRows.push({ text: rowText, cx, y: newY });
      reRemaining = reRemaining.slice(rowText.length).trim();
    }
    if (reRemaining.length === 0) return shiftedRows;
  }

  return usedRows;
}

// ── Binary search entry point ────────────────────────────────────────────────

export function fitHorizontal(
  text: string,
  polygon: [number, number][],
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): HorizontalLayout {
  let lo = minSize, hi = maxSize, bestSize = minSize;
  let bestRows: HorizontalLayoutRow[] = [{ text, cx: bounds.cx, y: bounds.cy }];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const rows = layoutHorizontal(text, mid, polygon, bounds);
    if (rows) {
      bestSize = mid;
      bestRows = rows;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { kind: "horizontal", fontSize: bestSize, rows: bestRows, lineHeight: bestSize * 1.2 };
}
