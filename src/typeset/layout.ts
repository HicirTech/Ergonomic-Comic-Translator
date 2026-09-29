import type { PlacedGlyph, ShapedGlyph, Shaper, TextLayout } from "./interfaces/index.ts";
import { breakLines } from "./kinsoku.ts";

/** Line pitch relative to the font size for horizontal text, and column pitch for vertical text. */
const linePitch = 1.25;
/** Baseline position below the top of the em box (CJK fonts put about 0.12 em below the baseline). */
const baselineShare = 0.88;
/** Characters drawn turned 90 degrees in vertical text because fonts have no vertical form for them. */
const turnedInVertical = /[—―～〜\-~a-zA-Z0-9]/u;

/** Per-character advance (font units) and the glyphs of each character, from one shaping pass. */
const charMetrics = (shaper: Shaper, text: string, direction: "h" | "v") => {
  const chars = [...text];
  const glyphs = shaper.shape(text, direction);
  // harfbuzz clusters are UTF-16 offsets; map each to its code-point index.
  const codePointAt = new Map<number, number>();
  let offset = 0;
  chars.forEach((char, index) => {
    codePointAt.set(offset, index);
    offset += char.length;
  });
  const perChar: ShapedGlyph[][] = chars.map(() => []);
  for (const glyph of glyphs) perChar[codePointAt.get(glyph.cluster) ?? 0]!.push(glyph);
  const advances = perChar.map((charGlyphs, index) =>
    direction === "v" && turnedInVertical.test(chars[index]!)
      ? shaper.upem
      : charGlyphs.reduce((sum, glyph) => sum + (direction === "h" ? glyph.xAdvance : Math.abs(glyph.yAdvance)), 0));
  return { chars, perChar, advances };
};

const place = (
  direction: "h" | "v",
  fontSize: number,
  width: number,
  height: number,
  metrics: ReturnType<typeof charMetrics>,
  starts: number[],
  upem: number,
): PlacedGlyph[] => {
  const scale = fontSize / upem;
  const pitch = fontSize * linePitch;
  const extent = starts.length * pitch - (pitch - fontSize);
  const glyphs: PlacedGlyph[] = [];
  starts.forEach((start, line) => {
    const end = line + 1 < starts.length ? starts[line + 1]! : metrics.chars.length;
    const length = metrics.advances.slice(start, end).reduce((sum, advance) => sum + advance, 0) * scale;
    let pen = direction === "h" ? (width - length) / 2 : (height - length) / 2;
    for (let index = start; index < end; index += 1) {
      const advance = metrics.advances[index]! * scale;
      if (direction === "h") {
        const baseline = (height - extent) / 2 + line * pitch + baselineShare * fontSize;
        for (const glyph of metrics.perChar[index]!) {
          glyphs.push({ id: glyph.id, x: pen + glyph.xOffset * scale, y: baseline - glyph.yOffset * scale, rotate: false });
        }
      } else {
        // Columns run right to left; each glyph fills one em cell of its column.
        const columnLeft = (width + extent) / 2 - line * pitch - fontSize;
        const turned = turnedInVertical.test(metrics.chars[index]!);
        for (const glyph of metrics.perChar[index]!) {
          const centering = turned ? 0 : (glyph.xOffset + upem / 2) * scale;
          glyphs.push({ id: glyph.id, x: columnLeft + centering, y: pen + baselineShare * fontSize, rotate: turned });
        }
      }
      pen += advance;
    }
  });
  return glyphs;
};

/**
 * Fits text into a width x height box: largest font size in [minSize, maxSize] whose kinsoku-broken
 * lines (or columns) fit, centred in both directions. When nothing fits, lays out at minSize and marks
 * the result as overflowing (FIT_OVERFLOW) rather than cutting text.
 */
export const layoutText = (
  shaper: Shaper,
  text: string,
  direction: "h" | "v",
  width: number,
  height: number,
  minSize: number,
  maxSize: number,
): TextLayout => {
  const normalized = direction === "h" ? text.replace(/\s+/gu, " ").trim() : text.replace(/\s+/gu, "");
  const metrics = charMetrics(shaper, normalized, direction);
  const along = direction === "h" ? width : height;
  const across = direction === "h" ? height : width;
  const linesAt = (size: number) => breakLines(metrics.chars, metrics.advances.map((advance) => (advance * size) / shaper.upem), along);
  const fits = (size: number) => {
    const lines = linesAt(size).length;
    return lines * size * linePitch - size * (linePitch - 1) <= across;
  };

  let low = Math.ceil(minSize);
  let high = Math.floor(Math.max(minSize, maxSize));
  let best: number | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const fontSize = best ?? Math.ceil(minSize);
  const starts = linesAt(fontSize);
  return {
    direction,
    fontSize,
    glyphs: place(direction, fontSize, width, height, metrics, starts, shaper.upem),
    lines: starts.length,
    overflow: best === null,
  };
};
