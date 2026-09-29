import type { Point } from "../../../geometry/interfaces/index.ts";

/**
 * A page rectangle to read: corners[0] -> corners[1] is the output width direction, corners[0] -> corners[3]
 * the height direction. Each quarter turn in `quarterTurns` (clockwise) is read as a separate candidate.
 */
export interface OcrCrop {
  corners: [Point, Point, Point, Point];
  width: number;
  height: number;
  quarterTurns: number[];
}
