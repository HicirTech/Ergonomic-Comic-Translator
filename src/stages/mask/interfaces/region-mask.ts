import type { Box } from "../../../geometry/interfaces/index.ts";

/** Text strokes of one region, in a window of the page, with the tone of the paper around them. */
export interface RegionMask {
  window: Box;
  /** Window-sized, 1 = text stroke (already grown over anti-aliased edges and an outline). */
  stroke: Uint8Array;
  /** Colour the text is set in: median RGB of the ink inside the lines, taken away from blended edges. */
  inkMedian: [number, number, number];
  /** Colour of the outline drawn around the glyphs, or null when the text has none. */
  outlineMedian: [number, number, number] | null;
  /** Median RGB of the paper band right next to the grown strokes. */
  ringMedian: [number, number, number];
  strokePixels: number;
}
