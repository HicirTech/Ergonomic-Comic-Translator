import type { ShapedGlyph } from "./shaped-glyph.ts";

/** Font access the layout needs; implemented over harfbuzzjs, faked in tests. */
export interface Shaper {
  upem: number;
  shape(text: string, direction: "h" | "v"): ShapedGlyph[];
  glyphPath(glyphId: number): string;
}
