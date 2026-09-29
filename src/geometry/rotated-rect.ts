import { normalizeLineAngle } from "./angle.ts";
import type { Point, RotatedRect } from "./interfaces/index.ts";

const degrees = 180 / Math.PI;

const cross = (origin: Point, a: Point, b: Point) =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

/** Convex hull by Andrew's monotone chain, counter-clockwise in image coordinates, without collinear points. */
export const convexHull = (input: readonly Point[]): Point[] => {
  const points = [...input].sort((a, b) => a.x - b.x || a.y - b.y);
  if (points.length < 3) {
    return points;
  }
  const lower: Point[] = [];
  for (const point of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

/** Minimum-area enclosing rectangle by rotating calipers over the hull edges; null for degenerate input. */
export const minAreaRect = (points: readonly Point[]): RotatedRect | null => {
  const hull = convexHull(points);
  if (hull.length < 3) {
    return null;
  }
  let best: { area: number; ux: number; uy: number; a0: number; a1: number; b0: number; b1: number } | null = null;
  for (let index = 0; index < hull.length; index += 1) {
    const p = hull[index]!;
    const q = hull[(index + 1) % hull.length]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length === 0) {
      continue;
    }
    const ux = (q.x - p.x) / length;
    const uy = (q.y - p.y) / length;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const r of hull) {
      const along = r.x * ux + r.y * uy;
      const across = -r.x * uy + r.y * ux;
      a0 = Math.min(a0, along);
      a1 = Math.max(a1, along);
      b0 = Math.min(b0, across);
      b1 = Math.max(b1, across);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) {
      best = { area, ux, uy, a0, a1, b0, b1 };
    }
  }
  if (!best) {
    return null;
  }
  const along = (best.a0 + best.a1) / 2;
  const across = (best.b0 + best.b1) / 2;
  const center = { x: along * best.ux - across * best.uy, y: along * best.uy + across * best.ux };
  const sideA = best.a1 - best.a0;
  const sideB = best.b1 - best.b0;
  const edgeAngle = Math.atan2(best.uy, best.ux) * degrees;
  return {
    center,
    long: Math.max(sideA, sideB),
    short: Math.min(sideA, sideB),
    angle: normalizeLineAngle(sideA >= sideB ? edgeAngle : edgeAngle + 90),
  };
};

/** Corners in order: start of the long axis on one side, clockwise on screen. */
export const rectCorners = (rect: RotatedRect): [Point, Point, Point, Point] => {
  const radians = rect.angle / degrees;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const hl = rect.long / 2;
  const hs = rect.short / 2;
  const at = (a: number, b: number): Point => ({ x: rect.center.x + a * ux - b * uy, y: rect.center.y + a * uy + b * ux });
  return [at(-hl, -hs), at(hl, -hs), at(hl, hs), at(-hl, hs)];
};

/**
 * Corners whose first edge runs along the reading direction: left to right for horizontal lines, top to
 * bottom for vertical ones. Warping these to an upright image turns a vertical column into a left-to-right
 * row (the 90 degree counter-clockwise turn PP-OCR recognisers expect).
 */
export const readingCorners = (rect: RotatedRect) =>
  rectCorners(Math.abs(rect.angle) > 45 && rect.angle < 0 ? { ...rect, angle: rect.angle + 180 } : rect);

/**
 * DB-style unclip for a rectangle: grows every side by area * ratio / perimeter, the offset distance
 * PaddleOCR's pyclipper expansion uses; for a rectangle the offset polygon is again a rectangle.
 */
export const unclipRect = (rect: RotatedRect, ratio: number): RotatedRect => {
  const perimeter = 2 * (rect.long + rect.short);
  if (perimeter === 0) {
    return rect;
  }
  const distance = (rect.long * rect.short * ratio) / perimeter;
  return { ...rect, long: rect.long + 2 * distance, short: rect.short + 2 * distance };
};

/** Rotates a point around `center` by `angle` degrees (clockwise on screen for positive angles). */
export const rotatePoint = (point: Point, center: Point, angle: number): Point => {
  const radians = angle / degrees;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};
