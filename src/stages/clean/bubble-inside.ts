import type { Box } from "../../geometry/interfaces/index.ts";
import type { GrayImage } from "../../imaging/interfaces/index.ts";

/**
 * A bubble's frame is a straight edge beside the text: along one row or column, most of the pixels differ
 * from their neighbours on the text's side by at least this much in tone. The paper of a dialogue box, the
 * artwork that shows through it and a curved outline do not: there the detector's box stays the limit.
 */
const frameContrast = 48;

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1] ?? 0;

/**
 * The detector's bubble box cut back to the bubble's frame where the page shows one beside a block of text.
 * From each side of the text outward, the inside ends before the first row or column that is a straight
 * edge along that side of the text; without one it ends at the detector's box. That box is not the inside
 * by itself: it also holds the bubble's tail, and lettering laid out in it stood across the frame on the
 * tail's side. `gray` is the page without its text, `text` the upright box the text stood in; where that
 * reaches past the bubble's box, the side stays the detector's.
 *
 * Only the lettering uses it. As the limit for the marks of the text it was measured to lose punctuation
 * that stands close to a frame, and other straight edges in a box (a divider, a name bar) count as frames.
 */
export const bubbleInside = (gray: GrayImage, text: Box, bubble: Box): Box => {
  const clamp = (value: number, limit: number) => Math.max(0, Math.min(limit, Math.round(value)));
  const x0 = clamp(text.x0, gray.width);
  const x1 = clamp(text.x1, gray.width);
  const y0 = clamp(text.y0, gray.height);
  const y1 = clamp(text.y1, gray.height);
  /** Median step in tone from column `x - towards` to column `x`, along the text's height. */
  const columnStep = (x: number, towards: number) => {
    const steps: number[] = [];
    for (let y = y0; y < y1; y += 1) steps.push(Math.abs(gray.data[y * gray.width + x]! - gray.data[y * gray.width + x - towards]!));
    return median(steps);
  };
  const rowStep = (y: number, towards: number) => {
    const steps: number[] = [];
    for (let x = x0; x < x1; x += 1) steps.push(Math.abs(gray.data[y * gray.width + x]! - gray.data[(y - towards) * gray.width + x]!));
    return median(steps);
  };
  /** The first position from `from`, going `towards` (-1 or 1) up to `to` inclusive, where the frame begins; null without one. */
  const frameFrom = (from: number, to: number, towards: number, stepAt: (position: number, towards: number) => number) => {
    for (let position = from; towards > 0 ? position <= to : position >= to; position += towards) {
      if (stepAt(position, towards) >= frameContrast) return position;
    }
    return null;
  };
  const left = clamp(bubble.x0, gray.width);
  const right = clamp(bubble.x1, gray.width);
  const top = clamp(bubble.y0, gray.height);
  const bottom = clamp(bubble.y1, gray.height);
  const leftFrame = frameFrom(x0 - 1, left, -1, columnStep);
  const rightFrame = frameFrom(x1, right - 1, 1, columnStep);
  const topFrame = frameFrom(y0 - 1, top, -1, rowStep);
  const bottomFrame = frameFrom(y1, bottom - 1, 1, rowStep);
  return {
    x0: leftFrame === null ? bubble.x0 : leftFrame + 1,
    y0: topFrame === null ? bubble.y0 : topFrame + 1,
    x1: rightFrame === null ? bubble.x1 : rightFrame,
    y1: bottomFrame === null ? bubble.y1 : bottomFrame,
  };
};
