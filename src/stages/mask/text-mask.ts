import { boundingBoxOfPoints, clampToImage, expandBox } from "../../geometry/box.ts";
import { rasterizeConvexQuad } from "../../geometry/raster.ts";
import type { GrayImage, RgbImage } from "../../imaging/interfaces/index.ts";
import { dilateSquare } from "../../imaging/morphology.ts";
import { otsuThreshold } from "../../imaging/threshold.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import type { RegionMask } from "./interfaces/index.ts";

/** The stroke mask grows by this share of the line thickness (at least 2 px) to cover anti-aliasing. */
const growShare = 0.15;
const minGrowPixels = 2;
/** Width of the paper ring around the lines, relative to line thickness. */
const ringShare = 0.5;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
};

/**
 * S5: text strokes of one region. Inside the unclipped (possibly rotated) line polygons, Otsu separates
 * ink from paper; the side away from the surrounding paper tone is the text, so dark-on-light and
 * light-on-dark both work. The grown mask never leaves the polygons' own neighbourhood.
 */
export const regionTextMask = (rgb: RgbImage, gray: GrayImage, lines: readonly TextLine[]): RegionMask | null => {
  if (lines.length === 0) {
    return null;
  }
  const thickness = median(lines.map((line) => line.rect.short));
  const grow = Math.max(minGrowPixels, Math.round(growShare * thickness));
  const ring = Math.max(grow + 1, Math.round(ringShare * thickness));
  const window = clampToImage(expandBox(boundingBoxOfPoints(lines.flatMap((line) => line.quad)), ring + grow), gray.width, gray.height);
  const width = window.x1 - window.x0;
  const height = window.y1 - window.y0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const polygon = new Uint8Array(width * height);
  for (const line of lines) {
    rasterizeConvexQuad(polygon, width, height, line.quad.map((point) => ({ x: point.x - window.x0, y: point.y - window.y0 })));
  }
  const around = dilateSquare(polygon, width, height, ring);
  const at = (index: number) => gray.data[(window.y0 + Math.floor(index / width)) * gray.width + window.x0 + (index % width)]!;

  const inside: number[] = [];
  const ringLuma: number[] = [];
  const ringRgb: [number[], number[], number[]] = [[], [], []];
  for (let index = 0; index < polygon.length; index += 1) {
    if (polygon[index]) {
      inside.push(at(index));
    } else if (around[index]) {
      ringLuma.push(at(index));
      const offset = ((window.y0 + Math.floor(index / width)) * rgb.width + window.x0 + (index % width)) * 3;
      for (let channel = 0; channel < 3; channel += 1) ringRgb[channel]!.push(rgb.data[offset + channel]!);
    }
  }
  if (inside.length === 0) {
    return null;
  }

  const threshold = otsuThreshold({ data: Uint8Array.from(inside), width: inside.length, height: 1 });
  const paper = median(ringLuma.length > 0 ? ringLuma : inside);
  const darkText = paper > threshold;
  const ink = new Uint8Array(width * height);
  for (let index = 0; index < polygon.length; index += 1) {
    if (polygon[index] && (darkText ? at(index) <= threshold : at(index) > threshold)) ink[index] = 1;
  }
  const grown = dilateSquare(ink, width, height, grow);
  const limit = dilateSquare(polygon, width, height, grow);
  let strokePixels = 0;
  for (let index = 0; index < grown.length; index += 1) {
    grown[index] = grown[index]! & limit[index]!;
    strokePixels += grown[index]!;
  }

  const mean = ringLuma.reduce((sum, value) => sum + value, 0) / Math.max(1, ringLuma.length);
  const variance = ringLuma.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, ringLuma.length);
  return {
    window,
    stroke: grown,
    ringMedian: [median(ringRgb[0]), median(ringRgb[1]), median(ringRgb[2])],
    ringStd: Math.sqrt(variance),
    strokePixels,
  };
};

/** ORs a region's strokes into a page-sized mask. */
export const addToPageMask = (pageMask: Uint8Array, pageWidth: number, region: RegionMask) => {
  const width = region.window.x1 - region.window.x0;
  for (let index = 0; index < region.stroke.length; index += 1) {
    if (region.stroke[index]) {
      pageMask[(region.window.y0 + Math.floor(index / width)) * pageWidth + region.window.x0 + (index % width)] = 1;
    }
  }
};
