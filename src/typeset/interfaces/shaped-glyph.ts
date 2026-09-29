/** One glyph after shaping, in font units (y up); `cluster` is the index of its source character. */
export interface ShapedGlyph {
  id: number;
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}
