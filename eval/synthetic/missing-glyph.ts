import type { Shaper } from "../../src/typeset/interfaces/index.ts";

const missingPrefix = "MISSING_GLYPH";

/** Code points whose shaping produced no glyph or only .notdef (TrueType glyph id 0). Spaces are skipped. */
export const missingGlyphs = (shaper: Shaper, text: string, direction: "h" | "v") => {
  const chars = [...text];
  const indexAt = new Map<number, number>();
  let offset = 0;
  chars.forEach((char, index) => {
    indexAt.set(offset, index);
    offset += char.length;
  });
  const ids = chars.map(() => [] as number[]);
  for (const glyph of shaper.shape(text, direction)) ids[indexAt.get(glyph.cluster) ?? 0]!.push(glyph.id);
  return chars.filter((char, index) => char.trim() !== "" && (ids[index]!.length === 0 || ids[index]!.every((id) => id === 0)));
};

/** Throws when the lettering font cannot draw a corpus sentence. The CLI turns this into a clear stop. */
export const assertGlyphsPresent = (shaper: Shaper, texts: readonly string[]) => {
  const problems: string[] = [];
  for (const text of texts) {
    for (const direction of ["h", "v"] as const) {
      const missing = missingGlyphs(shaper, text, direction);
      if (missing.length > 0) problems.push(`${text} (${direction}): ${missing.join(" ")}`);
    }
  }
  if (problems.length > 0) throw new Error(`${missingPrefix} ${problems.join("; ")}`);
};

export const isMissingGlyphError = (error: unknown) => error instanceof Error && error.message.startsWith(missingPrefix);
