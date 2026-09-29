import { minAreaRect, rectCorners, unclipRect } from "../../geometry/rotated-rect.ts";
import type { Point } from "../../geometry/interfaces/index.ts";
import { componentCornerPoints, labelComponents } from "../../imaging/components.ts";
import type { DbParams, TextLine } from "./interfaces/index.ts";

export const defaultDbParams: DbParams = {
  threshold: 0.3,
  boxThreshold: 0.6,
  unclipRatio: 1.5,
  minShortSide: 3,
  // PaddleX treats text as curved when its polygon fills less than ~0.6 of the rectangle.
  curvedFill: 0.6,
};

/**
 * Turns a DB probability map into text lines: threshold, 8-connected components, convex hull,
 * minimum-area rectangle, mean-probability score, analytic unclip. `toPage` maps map coordinates back
 * to page pixels (undoing padding and scaling of the crop).
 */
export const extractTextLines = (
  probability: Float32Array,
  width: number,
  height: number,
  toPage: (point: Point) => Point,
  params: DbParams = defaultDbParams,
): TextLine[] => {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = probability[index]! > params.threshold ? 1 : 0;
  }
  const { labels, components } = labelComponents(mask, width, height);

  const scoreSums = new Float64Array(components.length + 1);
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index]) scoreSums[labels[index]!] += probability[index]!;
  }

  const lines: TextLine[] = [];
  for (const component of components) {
    const score = scoreSums[component.label]! / component.pixels;
    if (score < params.boxThreshold) continue;
    const rect = minAreaRect(componentCornerPoints(component));
    if (!rect || rect.short < params.minShortSide) continue;

    const fill = component.pixels / (rect.long * rect.short);
    const grown = unclipRect(rect, params.unclipRatio);
    const quad = rectCorners(grown).map(toPage) as TextLine["quad"];
    const center = toPage(grown.center);
    const [a, b, , d] = quad;
    const long = Math.hypot(b.x - a.x, b.y - a.y);
    const short = Math.hypot(d.x - a.x, d.y - a.y);
    lines.push({
      quad,
      // Page mapping is a uniform scale plus offset, so the angle carries over unchanged.
      rect: { center, long, short, angle: grown.angle },
      score,
      curved: fill < params.curvedFill,
    });
  }
  return lines;
};
