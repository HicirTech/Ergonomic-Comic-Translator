import type { Point, RotatedRect } from "../../../geometry/interfaces/index.ts";

/** One detected text line: its oriented rectangle after unclip, as a quad in page pixels. */
export interface TextLine {
  quad: [Point, Point, Point, Point];
  rect: RotatedRect;
  /** Mean DB probability over the line's pixels. */
  score: number;
  /** Few pixels fill the rectangle: likely curved or irregular text. */
  curved: boolean;
}
