import { boundingBoxOfPoints, clampToImage, expandBox } from "../../geometry/box.ts";
import { rasterizeConvexQuad } from "../../geometry/raster.ts";
import type { GrayImage } from "../../imaging/interfaces/index.ts";
import { dilateSquare } from "../../imaging/morphology.ts";
import { otsuThreshold } from "../../imaging/threshold.ts";
import type { TextLine } from "../lines/interfaces/index.ts";

/**
 * A line's paper tone is the median of its rectangle with a band this wide around it (a share of the
 * thickness, at least 2 px): text covers less than half of its rectangle, so the median is paper, and it is
 * the paper the text sits on. A ring further out can lie on another surface (a text plate on artwork).
 */
const edgeBandShare = 0.1;
const minEdgeBandPixels = 2;

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0;

/** Width of the band around a line rectangle that is read with it, for text of the given thickness. */
export const edgeBandOf = (thickness: number) => Math.max(minEdgeBandPixels, Math.round(edgeBandShare * thickness));

/**
 * Which side of a line rectangle's tones is its ink: Otsu splits the tones inside the rectangle, and the ink
 * is the side away from the paper, the median tone of the rectangle with its band.
 */
export const inkSide = (inside: readonly number[], withBand: readonly number[]) => {
  const threshold = otsuThreshold({ data: Uint8Array.from(inside), width: inside.length, height: 1 });
  const paper = median(withBand);
  return { threshold, paper, darkText: paper > threshold };
};

/**
 * Whether a line is set dark on light or light on dark, and the tone of its paper; null when its rectangle
 * is off the page. With `paper` given, the tone of the paper the line stands on is known (that of the text
 * it stands among), and the ink is the side of the rectangle's tones further from it. A small rectangle
 * that a solid mark fills by more than half would otherwise pass for light lettering on dark paper.
 */
export const lineTone = (gray: GrayImage, line: TextLine, paper: number | null = null) => {
  const band = edgeBandOf(line.rect.short);
  const window = clampToImage(expandBox(boundingBoxOfPoints(line.quad), band), gray.width, gray.height);
  const width = window.x1 - window.x0;
  const height = window.y1 - window.y0;
  if (width <= 0 || height <= 0) return null;
  const polygon = new Uint8Array(width * height);
  rasterizeConvexQuad(polygon, width, height, line.quad.map((point) => ({ x: point.x - window.x0, y: point.y - window.y0 })));
  const withEdge = dilateSquare(polygon, width, height, band);
  const inside: number[] = [];
  const withBand: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const tone = gray.data[(window.y0 + Math.floor(index / width)) * gray.width + window.x0 + (index % width)]!;
    if (polygon[index]) inside.push(tone);
    if (withEdge[index]) withBand.push(tone);
  }
  if (inside.length === 0) return null;
  const own = inkSide(inside, withBand);
  if (paper === null) return { dark: own.darkText, paper: own.paper };
  const low = median(inside.filter((tone) => tone <= own.threshold));
  const high = median(inside.filter((tone) => tone > own.threshold));
  return { dark: Math.abs(high - paper) <= Math.abs(low - paper), paper };
};
