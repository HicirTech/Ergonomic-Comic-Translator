/**
 * Utilities for fitting translated text inside an OCR polygon.
 *
 * Strategy:
 *  - Use scanline intersection to compute the actual usable width at each row's
 *    Y position within the polygon, so text adapts to irregular (non-rectangular) shapes.
 *  - For horizontal lines: wrap text into rows respecting polygon width at each Y,
 *    binary-search for the largest font size that fits.
 *  - For vertical lines: stack characters top-to-bottom in columns, using polygon
 *    height at each column's X position.
 *  - Non-CJK (space-separated) text uses word-level wrapping for natural line breaks.
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

// ── Scanline polygon intersection ────────────────────────────────────────────

/**
 * Compute the horizontal span inside `polygon` at a given Y coordinate.
 * Returns `{ left, right }` representing the usable X range, or null if Y
 * is outside the polygon.
 */
function polygonSpanAtY(polygon: [number, number][], y: number): { left: number; right: number } | null {
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
function polygonSpanAtX(polygon: [number, number][], x: number): { top: number; bottom: number } | null {
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
function isCjk(text: string): boolean {
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
function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 0x2E7F ? fontSize : fontSize * 0.6;
  }
  return w;
}

// ── Horizontal layout ────────────────────────────────────────────────────────

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

/**
 * Wrap text into rows using character-level breaking (for CJK text).
 * Each row respects the available width at its Y position in the polygon.
 */
function wrapCharLevel(text: string, fontSize: number, maxWidth: number): string[] {
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

/**
 * Wrap text into rows using word-level breaking (for non-CJK / Latin text).
 * Breaks at spaces and hyphens for natural line breaks.
 */
function wrapWordLevel(text: string, fontSize: number, maxWidth: number): string[] {
  const rows: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") { rows.push(""); continue; }
    // Split into words preserving spaces as part of the following word
    const words = paragraph.match(/\S+/g) || [""];
    let current = "";
    let currentW = 0;
    for (const word of words) {
      const wordW = measureText(word, fontSize);
      const spaceW = current === "" ? 0 : fontSize * 0.6; // space between words
      if (currentW + spaceW + wordW > maxWidth + 0.5 && current !== "") {
        rows.push(current);
        current = word;
        currentW = wordW;
      } else {
        current = current === "" ? word : current + " " + word;
        currentW += spaceW + wordW;
      }
    }
    if (current) rows.push(current);
  }
  return rows.length ? rows : [""];
}

/**
 * Wrap text respecting polygon shape at each row's Y position.
 * Returns positioned rows with individual cx/y, or null if text doesn't fit.
 */
function wrapHorizontalPolygon(
  text: string,
  fontSize: number,
  polygon: [number, number][],
  bounds: PolyBounds,
): HorizontalLayoutRow[] | null {
  const lineHeight = fontSize * 1.2;
  const useCjk = isCjk(text);
  const insetY = bounds.h * 0.02;
  const availableH = bounds.h - insetY * 2;
  const maxRows = Math.floor(availableH / lineHeight);
  if (maxRows < 1) return null;

  // First pass: wrap using AABB width to get line count estimate,
  // then refine using polygon widths at each row's Y position
  const insetX = bounds.w * 0.02;
  const aabbWidth = bounds.w - insetX * 2;

  // Initial wrap with AABB
  const initialRows = useCjk
    ? wrapCharLevel(text, fontSize, aabbWidth)
    : wrapWordLevel(text, fontSize, aabbWidth);

  // Compute Y positions (vertically centred within bounds)
  const totalH = initialRows.length * lineHeight;
  if (totalH > availableH) return null;
  const topY = bounds.cy - totalH / 2 + lineHeight * 0.8; // first baseline

  // Second pass: re-wrap using actual polygon width at each row's Y
  const rows: HorizontalLayoutRow[] = [];
  let textRemaining = text.replace(/\n/g, useCjk ? "" : " ").trim();
  let currentY = topY;

  for (let rowIdx = 0; rowIdx < maxRows && textRemaining.length > 0; rowIdx++) {
    const span = polygonSpanAtY(polygon, currentY - fontSize * 0.3); // sample near middle of row
    if (!span) {
      // This Y is outside polygon — try next row
      currentY += lineHeight;
      continue;
    }
    const rowWidth = (span.right - span.left) * 0.96; // 4% inset
    const rowCx = (span.left + span.right) / 2;

    if (rowWidth < fontSize * 0.6) {
      currentY += lineHeight;
      continue;
    }

    // Wrap one row's worth of text
    let rowText = "";
    let rowW = 0;

    if (useCjk) {
      const chars = [...textRemaining];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const charW = ch.charCodeAt(0) > 0x2E7F ? fontSize : fontSize * 0.6;
        if (rowW + charW > rowWidth + 0.5 && rowText !== "") break;
        rowText += ch;
        rowW += charW;
      }
    } else {
      const words = textRemaining.match(/\S+/g) || [];
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordW = measureText(word, fontSize);
        const spaceW = rowText === "" ? 0 : fontSize * 0.6;
        if (rowW + spaceW + wordW > rowWidth + 0.5 && rowText !== "") break;
        rowText = rowText === "" ? word : rowText + " " + word;
        rowW += spaceW + wordW;
      }
    }

    if (rowText === "") {
      currentY += lineHeight;
      continue;
    }

    rows.push({ text: rowText, cx: rowCx, y: currentY });
    textRemaining = textRemaining.slice(rowText.length).trim();
    currentY += lineHeight;
  }

  // If we couldn't fit all text, return null (font too large)
  if (textRemaining.length > 0) return null;
  if (rows.length === 0) return null;
  return rows;
}

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
    const rows = wrapHorizontalPolygon(text, mid, polygon, bounds);
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

// ── Vertical layout ──────────────────────────────────────────────────────────

export interface VerticalLayoutColumn {
  chars: string;
  x: number;
  startY: number;
}

export interface VerticalLayout {
  kind: "vertical";
  fontSize: number;
  columns: VerticalLayoutColumn[];
  columnWidth: number;
}

/**
 * Wrap text into columns respecting polygon shape at each column's X position.
 * Returns positioned columns, or null if text doesn't fit.
 */
function wrapVerticalPolygon(
  text: string,
  fontSize: number,
  polygon: [number, number][],
  bounds: PolyBounds,
): VerticalLayoutColumn[] | null {
  const colW = fontSize * 1.1;
  const charH = fontSize * 1.1;
  const flat = text.replace(/\n/g, "");
  if (flat.length === 0) return [{ chars: "", x: bounds.cx, startY: bounds.cy }];

  const insetX = bounds.w * 0.02;
  const availableW = bounds.w - insetX * 2;
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

    const colHeight = (span.bottom - span.top) * 0.96;
    const charsPerCol = Math.max(1, Math.floor(colHeight / charH));
    const colStartY = span.top + (span.bottom - span.top) * 0.02 + fontSize;

    const chunk = remaining.slice(0, charsPerCol);
    columns.push({ chars: chunk, x: colX, startY: colStartY });
    remaining = remaining.slice(chunk.length);
  }

  if (remaining.length > 0) return null;
  if (columns.length === 0) return null;
  return columns;
}

export function fitVertical(
  text: string,
  polygon: [number, number][],
  bounds: PolyBounds,
  minSize = 8,
  maxSize = 72,
): VerticalLayout {
  let lo = minSize, hi = maxSize, bestSize = minSize;
  let bestCols: VerticalLayoutColumn[] = [{ chars: text, x: bounds.cx, startY: bounds.cy }];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cols = wrapVerticalPolygon(text, mid, polygon, bounds);
    if (cols) {
      bestSize = mid;
      bestCols = cols;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { kind: "vertical", fontSize: bestSize, columns: bestCols, columnWidth: bestSize * 1.1 };
}

export type PolygonTextLayout = HorizontalLayout | VerticalLayout;

export function fitTextInPolygon(
  text: string,
  polygon: [number, number][],
  orientation: "horizontal" | "vertical",
): PolygonTextLayout {
  const bounds = polyBounds(polygon);
  if (orientation === "vertical") return fitVertical(text, polygon, bounds);
  return fitHorizontal(text, polygon, bounds);
}
