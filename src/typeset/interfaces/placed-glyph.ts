/** A glyph at its pen position in layout-box pixels (y down); `rotate` turns it 90 degrees (vertical dashes). */
export interface PlacedGlyph {
  id: number;
  x: number;
  y: number;
  rotate: boolean;
}
