import { boundingBoxOfPoints, boxCenter, expandBox } from "../../src/geometry/box.ts";
import type { Box, Point } from "../../src/geometry/interfaces/index.ts";
import { bubblePadPx } from "./constants.ts";
import type { SyntheticPage } from "./interfaces/index.ts";

/** What the generator painted under a point: a bubble disc, noisy scenery, or the paper fill. */
export type PaintedSurface = "bubble" | "texture-or-noise" | "plain-paper";

/** True inside the ellipse paintBubble draws in `box` (the block bounds grown by bubblePadPx). */
export const insideBubble = (point: Point, box: Box) => {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const rx = (box.x1 - box.x0) / 2;
  const ry = (box.y1 - box.y0) / 2;
  if (rx <= 0 || ry <= 0) return false;
  const nx = (point.x - cx) / rx;
  const ny = (point.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
};

/**
 * Surface under the centre of a predicted box. Bubble discs are the same ellipses paint-page draws
 * (block bounds grown by bubblePadPx). Paper pages are plain; dark and texture pages are not.
 */
export const paintedSurface = (page: SyntheticPage, box: Box): PaintedSurface => {
  const center = boxCenter(box);
  for (const block of page.blocks) {
    if (!block.bubble) continue;
    if (insideBubble(center, expandBox(boundingBoxOfPoints(block.polygon), bubblePadPx))) return "bubble";
  }
  return page.background === "paper" ? "plain-paper" : "texture-or-noise";
};
