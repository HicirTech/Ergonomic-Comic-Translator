/**
 * Region frame rotated by `angle` degrees around its centre (0 for tilts up to 5 degrees): w runs along the reading direction of
 * horizontal text (across the columns of vertical text), h across it. Typesetting fills this frame and
 * rotates the result back by `angle`.
 */
export interface OrientedFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}
