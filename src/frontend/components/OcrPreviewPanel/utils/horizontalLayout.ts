/**
 * Horizontal text layout — fits translated text into a polygon using scanline
 * intersection so each row adapts to the polygon's actual width.
 *
 * For non-CJK text, wraps at word boundaries for natural line breaks.
 */

import type { PolyBounds } from "./polygonGeometry.ts";
import { polygonSpanAtY, isCjk, measureText, CJK_CODEPOINT_MIN } from "./polygonGeometry.ts";

const PAD_X_FACTOR = 0.65; // horizontal padding from polygon edge (fraction of fontSize)

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
    const charW = ch.charCodeAt(0) > CJK_CODEPOINT_MIN ? fontSize : fontSize * 0.6;
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
    if (w + spaceW + wordW > maxWidth + 0.5) {
      // First word too wide — fall back to character-level splitting
      if (row === "") return consumeCharRow(text, fontSize, maxWidth);
      break;
    }
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
  const padY = fontSize * 0.65; // vertical padding from polygon edge
  const minY = bounds.y + padY + fontSize; // first possible baseline
  const maxY = bounds.y + bounds.h - padY;

  // 1. Build list of candidate slots (Y positions with usable width).
  //    Sample the polygon span at multiple vertical offsets within each text
  //    row (top of ascenders, mid-height, baseline) and use the *narrowest*
  //    intersected span.  This prevents text from being placed wider than the
  //    polygon at any point in the row, which is the main cause of clipping
  //    in irregular polygons.
  interface Slot { y: number; width: number; cx: number }
  const slots: Slot[] = [];
  for (let y = minY; y <= maxY; y += lineHeight) {
    // Sample at top-of-glyph, mid-height and baseline
    const offsets = [y - fontSize * 0.85, y - fontSize * 0.45, y];
    let narrowLeft = -Infinity;
    let narrowRight = Infinity;
    let miss = false;
    for (const sy of offsets) {
      const span = polygonSpanAtY(polygon, sy);
      if (!span) { miss = true; break; }
      if (span.left > narrowLeft) narrowLeft = span.left;
      if (span.right < narrowRight) narrowRight = span.right;
    }
    if (miss) continue;
    const padX = fontSize * PAD_X_FACTOR;
    const left = narrowLeft + padX;
    const right = narrowRight - padX;
    const w = right - left;
    if (w < fontSize * 0.6) continue; // too narrow for even one character
    slots.push({ y, width: w, cx: (left + right) / 2 });
  }
  if (slots.length === 0) return null;

  // 2. Split text into paragraphs, respecting explicit newlines
  const paragraphs = text.split(/\n/).map(p =>
    useCjk ? p.replace(/\s+/g, "") : p.replace(/\s+/g, " ").trim()
  );
  const allEmpty = paragraphs.every(p => p.length === 0);
  if (allEmpty) return [{ text: "", cx: bounds.cx, y: bounds.cy }];

  // 3. Greedily fill slots, paragraph by paragraph (newline = forced new row)
  const usedRows: HorizontalLayoutRow[] = [];
  let slotIdx = 0;
  for (const para of paragraphs) {
    let remaining = para;
    if (remaining.length === 0) {
      // Empty paragraph → skip a slot for a visual line break
      slotIdx++;
      continue;
    }
    while (remaining.length > 0) {
      if (slotIdx >= slots.length) return null; // no more room
      const slot = slots[slotIdx];
      const rowText = useCjk
        ? consumeCharRow(remaining, fontSize, slot.width)
        : consumeWordRow(remaining, fontSize, slot.width);
      if (rowText === "") { slotIdx++; continue; }
      usedRows.push({ text: rowText, cx: slot.cx, y: slot.y });
      remaining = remaining.slice(rowText.length).trim();
      slotIdx++;
    }
  }

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
    // Verify each shifted Y is still inside the polygon and the row text still fits
    const shiftedRows: HorizontalLayoutRow[] = [];
    let canShift = true;
    for (const row of usedRows) {
      const newY = row.y + shift;
      // Multi-sample the shifted position the same way we built the original slots
      const offsets = [newY - fontSize * 0.85, newY - fontSize * 0.45, newY];
      let narrowLeft = -Infinity;
      let narrowRight = Infinity;
      let miss = false;
      for (const sy of offsets) {
        const span = polygonSpanAtY(polygon, sy);
        if (!span) { miss = true; break; }
        if (span.left > narrowLeft) narrowLeft = span.left;
        if (span.right < narrowRight) narrowRight = span.right;
      }
      if (miss) { canShift = false; break; }
      const padX2 = fontSize * PAD_X_FACTOR;
      const availW = (narrowRight - narrowLeft) - padX2 * 2;
      // Check that the original row text still fits at the shifted position
      if (measureText(row.text, fontSize) > availW + 0.5) { canShift = false; break; }
      const cx = (narrowLeft + narrowRight) / 2;
      shiftedRows.push({ text: row.text, cx, y: newY });
    }
    if (canShift) return shiftedRows;
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
