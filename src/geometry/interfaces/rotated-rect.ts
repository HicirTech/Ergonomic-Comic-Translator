import type { Point } from "./point.ts";

/**
 * Oriented rectangle. `angle` is the direction of the long side in degrees, image coordinates (y down),
 * normalised to (-90, 90]; positive angles turn clockwise on screen, the same sign as sharp.rotate().
 */
export interface RotatedRect {
  center: Point;
  long: number;
  short: number;
  angle: number;
}
