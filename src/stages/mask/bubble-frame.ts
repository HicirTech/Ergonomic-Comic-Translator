import type { Box } from "../../geometry/interfaces/index.ts";

/**
 * A bubble's own outline and its ornaments lie within this share of the bubble's shorter side from the
 * detector's box, and no marks are looked for there. Measured on one volume: the frame of a dialogue box
 * lies 3 to 10 px inside a box 190 to 230 px high, and pieces of it beside the text were taken for dots.
 */
const bubbleFrameShare = 0.05;
/**
 * The detector's box stands off the frame by a few pixels whatever the bubble's size, so on a small bubble
 * the share falls short of the frame, and a line rectangle that reaches over it took the frame for text.
 */
const bubbleFrameMinPixels = 12;

/** The band along the edge of the detector's box of `bubble` in which no marks are looked for: the frame's ornaments lie there. */
export const bubbleOrnamentBandOf = (bubble: Box) => bubbleFrameShare * Math.min(bubble.x1 - bubble.x0, bubble.y1 - bubble.y0);

/** How far inside the detector's box of `bubble` its frame may lie: ink mostly within this band is the frame, not text. */
export const bubbleFrameReachOf = (bubble: Box) => Math.max(bubbleFrameMinPixels, bubbleOrnamentBandOf(bubble));
