import { rectCorners } from "../../src/geometry/rotated-rect.ts";
import type { TextLine } from "../../src/stages/lines/interfaces/index.ts";

/** A text line centred at (cx, cy) with its long axis at `angle` degrees. */
export const line = (cx: number, cy: number, long: number, short: number, angle: number, score = 0.9): TextLine => {
  const rect = { center: { x: cx, y: cy }, long, short, angle };
  return { quad: rectCorners(rect), rect, score, curved: false };
};
