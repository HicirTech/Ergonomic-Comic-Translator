import type { Quad } from "./quad.ts";

/** One generated line. The layout box is stored so the raster and the polygon stay the same rectangle. */
export interface GroundTruthLine {
  text: string;
  order: number;
  polygon: Quad;
  cx: number;
  cy: number;
  width: number;
  height: number;
}
