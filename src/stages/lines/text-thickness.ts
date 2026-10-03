import type { TextLine } from "./interfaces/index.ts";

/**
 * The thickness most of the text in `lines` is set in: the median of the lines' thicknesses, each weighted
 * by its length. A stray mark, or a fragment the line detector found inside a longer line, is short and
 * does not move it, as it moves the plain median of two or three lines. Null without lines.
 */
export const textThickness = (lines: readonly TextLine[]) => {
  const sorted = [...lines].sort((a, b) => a.rect.short - b.rect.short);
  const half = sorted.reduce((sum, line) => sum + line.rect.long, 0) / 2;
  let reached = 0;
  for (const line of sorted) {
    reached += line.rect.long;
    if (reached >= half) return line.rect.short;
  }
  return null;
};
