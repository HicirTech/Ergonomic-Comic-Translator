import type { Box, Point } from "./interfaces/index.ts";

export const boxWidth = (box: Box) => box.x1 - box.x0;
export const boxHeight = (box: Box) => box.y1 - box.y0;
export const boxArea = (box: Box) => Math.max(0, boxWidth(box)) * Math.max(0, boxHeight(box));
export const boxCenter = (box: Box): Point => ({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });

export const intersectionArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

export const iou = (a: Box, b: Box) => {
  const inter = intersectionArea(a, b);
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
};

/** Share of `inner` that lies inside `outer` (0..1). */
export const coverage = (inner: Box, outer: Box) => {
  const area = boxArea(inner);
  return area > 0 ? intersectionArea(inner, outer) / area : 0;
};

export const unionBox = (boxes: readonly Box[]): Box => ({
  x0: Math.min(...boxes.map((box) => box.x0)),
  y0: Math.min(...boxes.map((box) => box.y0)),
  x1: Math.max(...boxes.map((box) => box.x1)),
  y1: Math.max(...boxes.map((box) => box.y1)),
});

export const containsPoint = (box: Box, point: Point) =>
  point.x >= box.x0 && point.x <= box.x1 && point.y >= box.y0 && point.y <= box.y1;

export const expandBox = (box: Box, margin: number): Box => ({
  x0: box.x0 - margin,
  y0: box.y0 - margin,
  x1: box.x1 + margin,
  y1: box.y1 + margin,
});

/** Clamps to [0, width] x [0, height] and rounds outwards to whole pixels. */
export const clampToImage = (box: Box, width: number, height: number): Box => ({
  x0: Math.max(0, Math.floor(box.x0)),
  y0: Math.max(0, Math.floor(box.y0)),
  x1: Math.min(width, Math.ceil(box.x1)),
  y1: Math.min(height, Math.ceil(box.y1)),
});

export const boundingBoxOfPoints = (points: readonly Point[]): Box => ({
  x0: Math.min(...points.map((point) => point.x)),
  y0: Math.min(...points.map((point) => point.y)),
  x1: Math.max(...points.map((point) => point.x)),
  y1: Math.max(...points.map((point) => point.y)),
});
