import type { Box } from "../../../geometry/interfaces/index.ts";

/** Text strokes of one region, in a window of the page, with the tone of the paper around them. */
export interface RegionMask {
  window: Box;
  /** Window-sized, 1 = text stroke (already grown to cover anti-aliasing). */
  stroke: Uint8Array;
  /** Median RGB of the ring just outside the lines. */
  ringMedian: [number, number, number];
  /** Luma standard deviation of that ring: low means plain paper that a flat fill can restore. */
  ringStd: number;
  strokePixels: number;
}
