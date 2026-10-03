/** Colours of one lettered block. */
export interface LetteringStyle {
  /** CSS colour of the glyphs. */
  fill: string;
  /** CSS colour of the stroke painted under the glyphs, or null for none. */
  outline: string | null;
}
