import type { PlacedGlyph } from "./placed-glyph.ts";

/** A laid-out text block inside a box whose top-left is (0, 0). */
export interface TextLayout {
  direction: "h" | "v";
  fontSize: number;
  glyphs: PlacedGlyph[];
  lines: number;
  /** The text did not fit even at the minimum size (FIT_OVERFLOW). */
  overflow: boolean;
}
