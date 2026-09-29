import type { Box } from "../../geometry/interfaces/index.ts";

/** One connected component of a binary mask, with the extent of each of its rows for hull building. */
export interface ComponentStats {
  label: number;
  pixels: number;
  box: Box;
  /** [row, minX, maxX] for every row the component touches. */
  rows: [number, number, number][];
}
