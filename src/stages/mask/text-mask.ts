import { boundingBoxOfPoints, clampToImage, expandBox } from "../../geometry/box.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import { rasterizeConvexQuad } from "../../geometry/raster.ts";
import { rectCorners } from "../../geometry/rotated-rect.ts";
import { labelComponents } from "../../imaging/components.ts";
import type { GrayImage, RgbImage } from "../../imaging/interfaces/index.ts";
import { dilateSquare, erodeSquare } from "../../imaging/morphology.ts";
import { otsuThreshold } from "../../imaging/threshold.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import { textThickness } from "../lines/text-thickness.ts";
import type { RegionMask } from "./interfaces/index.ts";
import { keepLineMarks } from "./line-marks.ts";

/**
 * The stroke mask grows until the paper is reached: at least 2 px for anti-aliased edges (measured on
 * dialogue panels whose clean picture is known: no rim of ink stays), and further over an outline drawn
 * around the glyphs, up to this share of the line thickness. Growing every mask that far (6 px on 37 px
 * lines) merged the strokes of a line into one band, which no fill restores without a patch.
 */
const minGrowPixels = 2;
const maxGrowShare = 0.15;
/**
 * The outline ends at the first shell around the ink whose tone is within this many levels of the paper.
 * Tone, not colour: lossy pages shift the chroma around dark text by up to 17 levels with nothing drawn there.
 */
const paperToneTolerance = 3;
/** Width of the paper band next to the grown strokes. */
const paperBandPixels = 6;
/**
 * A line's paper tone is the median of its rectangle with a band this wide around it (a share of the
 * thickness, at least 2 px): text covers less than half of its rectangle, so the median is paper, and it is
 * the paper the text sits on. A ring further out can lie on another surface (a text plate on artwork).
 */
const edgeBandShare = 0.1;
const minEdgeBandPixels = 2;
/**
 * An outline differs from the paper and from the ink by at least this much on some channel. Less than that
 * around the text is not taken for one: measured on one volume against its textless pages, the paper is up
 * to 29 levels lighter next to the dialogue than 10 px away with nothing drawn around the glyphs (the
 * artwork is lighter where the text was placed), and a mask grown over that leaves a band.
 */
const outlineContrast = 48;
/**
 * Marks are looked for this far past the ends of a line and beside it, in line thicknesses. Inside a
 * bubble the search goes further, because nothing but text is that dark in a bubble: along the line it
 * follows a leader of eight dots (on one volume the last dot of one lay 4.1 thicknesses past its line), and
 * beside the line it reaches the next line position, where a row of dots set as a line of its own is not
 * found by the line detector. On open artwork it stays close.
 */
const markAlongShare = 4;
const markAlongInBubbleShare = 6;
const markAcrossShare = 0.5;
const markAcrossInBubbleShare = 1.5;
/**
 * A bubble's own outline and its ornaments lie within this share of the bubble's shorter side from the
 * detector's box, and no marks are looked for there. Measured on one volume: the frame of a dialogue box
 * lies 3 to 10 px inside a box 190 to 230 px high, and pieces of it beside the text were taken for dots.
 */
const bubbleFrameShare = 0.05;
/** A mark has the colour of its line's ink, within this much on every channel. */
const markInkTolerance = 24;
/** An area enclosed by ink is a glyph's fill, not paper, when its tone is this far from the line's paper. */
const fillStep = 12;
/** Fills amounting to this share of the strokes make the strokes an outline (a few stray fills do not). */
const outlinedFillShare = 0.2;
/**
 * Ink longer than this many line thicknesses that fills less than this share of its bounding box is a thin
 * curve, not text: a 3 px bubble outline fills about 7 % of its box, glyphs that touch each other far more.
 */
const structureLengthShare = 3;
const structureDensity = 0.12;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
};

/**
 * S5: text strokes of one region. Inside each unclipped (possibly rotated) line polygon, Otsu separates
 * ink from paper; the side away from that line's paper tone is the text, so dark-on-light and
 * light-on-dark both work, also when one region holds both. Small blobs of the same ink that continue a
 * line or sit beside it are text too (keepLineMarks); with a `bubble` they are only looked for inside it.
 * The grown mask never leaves the neighbourhood of the lines and their marks.
 */
export const regionTextMask = (rgb: RgbImage, gray: GrayImage, lines: readonly TextLine[], bubble: Box | null = null): RegionMask | null => {
  const thickness = textThickness(lines);
  if (thickness === null) {
    return null;
  }
  const maxGrow = Math.max(minGrowPixels, Math.round(maxGrowShare * thickness));
  const edgeBand = Math.max(minEdgeBandPixels, Math.round(edgeBandShare * thickness));
  const along = bubble ? markAlongInBubbleShare : markAlongShare;
  const across = bubble ? markAcrossInBubbleShare : markAcrossShare;
  const zoneQuads = lines.map((line) => rectCorners({
    ...line.rect,
    long: line.rect.long + 2 * along * line.rect.short,
    short: line.rect.short * (1 + 2 * across),
  }));
  const reach = [...lines.flatMap((line) => line.quad), ...zoneQuads.flat()];
  const window = clampToImage(expandBox(boundingBoxOfPoints(reach), edgeBand + maxGrow + paperBandPixels), gray.width, gray.height);
  const width = window.x1 - window.x0;
  const height = window.y1 - window.y0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const rasterized = (quad: readonly { x: number; y: number }[]) => {
    const mask = new Uint8Array(width * height);
    rasterizeConvexQuad(mask, width, height, quad.map((point) => ({ x: point.x - window.x0, y: point.y - window.y0 })));
    return mask;
  };
  const linePolygons = lines.map((line) => rasterized(line.quad));
  const polygon = new Uint8Array(width * height);
  for (const linePolygon of linePolygons) {
    for (let index = 0; index < polygon.length; index += 1) polygon[index] = polygon[index]! | linePolygon[index]!;
  }
  let polygonPixels = 0;
  for (let index = 0; index < polygon.length; index += 1) polygonPixels += polygon[index]!;
  if (polygonPixels === 0) {
    return null;
  }
  const pageIndex = (index: number) => (window.y0 + Math.floor(index / width)) * gray.width + window.x0 + (index % width);
  const at = (index: number) => gray.data[pageIndex(index)]!;
  const frame = bubble ? bubbleFrameShare * Math.min(bubble.x1 - bubble.x0, bubble.y1 - bubble.y0) : 0;
  const inBubble = (index: number) => {
    if (!bubble) return true;
    const x = window.x0 + (index % width);
    const y = window.y0 + Math.floor(index / width);
    return x >= bubble.x0 + frame && x < bubble.x1 - frame && y >= bubble.y0 + frame && y < bubble.y1 - frame;
  };

  const rgbOf = (picked: Uint8Array): [number, number, number] => {
    const channels: [number[], number[], number[]] = [[], [], []];
    for (let index = 0; index < picked.length; index += 1) {
      if (!picked[index]) continue;
      const offset = pageIndex(index) * 3;
      for (let channel = 0; channel < 3; channel += 1) channels[channel]!.push(rgb.data[offset + channel]!);
    }
    return [median(channels[0]), median(channels[1]), median(channels[2])];
  };

  const ink = new Uint8Array(width * height);
  const glyphFill = new Uint8Array(width * height);
  const candidate = new Uint8Array(width * height);
  const zone = new Uint8Array(width * height);
  linePolygons.forEach((linePolygon, lineIndex) => {
    const withEdge = dilateSquare(linePolygon, width, height, edgeBand);
    const inside: number[] = [];
    const own: number[] = [];
    for (let index = 0; index < linePolygon.length; index += 1) {
      if (linePolygon[index]) inside.push(at(index));
      if (withEdge[index]) own.push(at(index));
    }
    if (inside.length === 0) return;
    const threshold = otsuThreshold({ data: Uint8Array.from(inside), width: inside.length, height: 1 });
    const paper = median(own);
    const darkText = paper > threshold;
    const isInk = (index: number) => (darkText ? at(index) <= threshold : at(index) > threshold);
    const ownInk = linePolygon.map((value, index) => (value && isInk(index) ? 1 : 0));

    // An outline is ink too, and what it encloses is the glyph's fill: paper inside a glyph has the paper's
    // tone, a fill does not.
    const open = linePolygon.map((value, index) => (value && !ownInk[index] ? 1 : 0));
    const { labels, components } = labelComponents(open, width, height);
    const enclosed = components.map((component) => component.pixels <= thickness * thickness);
    const tones: number[][] = components.map(() => []);
    for (let index = 0; index < open.length; index += 1) {
      const label = labels[index]!;
      if (!label) continue;
      tones[label - 1]!.push(at(index));
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1
        || !linePolygon[index - 1] || !linePolygon[index + 1] || !linePolygon[index - width] || !linePolygon[index + width]) enclosed[label - 1] = false;
    }
    const filled = components.map((_component, index) => enclosed[index]! && Math.abs(median(tones[index]!) - paper) > fillStep);
    for (let index = 0; index < open.length; index += 1) {
      const label = labels[index]!;
      if (!label || !filled[label - 1]) continue;
      ownInk[index] = 1;
      glyphFill[index] = 1;
    }

    // Marks are set in the line's own ink: a blob of another colour is artwork, however dark.
    const lineInkRgb = rgbOf(ownInk.map((value, index) => (value && isInk(index) ? 1 : 0)));
    const sameInk = (index: number) => {
      const offset = pageIndex(index) * 3;
      return lineInkRgb.every((value, channel) => Math.abs(rgb.data[offset + channel]! - value) <= markInkTolerance);
    };
    const lineZone = rasterized(zoneQuads[lineIndex]!);
    for (let index = 0; index < linePolygon.length; index += 1) {
      if (linePolygon[index]) {
        if (ownInk[index]) ink[index] = 1;
      } else if (lineZone[index] && inBubble(index)) {
        zone[index] = 1;
        if (!polygon[index] && isInk(index) && sameInk(index)) candidate[index] = 1;
      }
    }
  });
  // A long, thin curve of the same ink is not text but a bubble outline or a line of the artwork. Where it
  // runs outside the rectangles or along their edge it stays; well inside a rectangle it cannot be told from
  // a glyph that touches it, and goes with the text.
  const inked = ink.map((value, index) => value | candidate[index]!);
  const drawn = labelComponents(inked, width, height);
  const structure = drawn.components.map((component) => {
    const boxWidth = component.box.x1 - component.box.x0;
    const boxHeight = component.box.y1 - component.box.y0;
    return Math.max(boxWidth, boxHeight) > structureLengthShare * thickness && component.pixels < structureDensity * boxWidth * boxHeight;
  });
  const interior = erodeSquare(polygon, width, height, edgeBand);
  for (let index = 0; index < inked.length; index += 1) {
    const label = drawn.labels[index]!;
    if (!label || !structure[label - 1] || interior[index]) continue;
    ink[index] = 0;
    glyphFill[index] = 0;
    candidate[index] = 0;
  }
  const lineInk = ink.slice();

  const lineBoxes = lines.map((line) => {
    const box = boundingBoxOfPoints(line.quad);
    return { x0: box.x0 - window.x0, y0: box.y0 - window.y0, x1: box.x1 - window.x0, y1: box.y1 - window.y0 };
  });
  const marks = keepLineMarks(candidate, zone, polygon, width, height, lineBoxes, thickness);
  const reachMask = new Uint8Array(width * height);
  for (let index = 0; index < ink.length; index += 1) {
    ink[index] = ink[index]! | marks[index]!;
    reachMask[index] = polygon[index]! | marks[index]!;
  }

  // The shells around the ink, one pixel at a time; the one past the furthest the mask may grow is the paper.
  // An outline lies against the ink: the shells from the ink outward that are not that paper yet, when one
  // of them is as far from it as an outline is. A shell further out that differs again is the background.
  const reached: Uint8Array[] = [ink];
  for (let distance = 1; distance <= maxGrow + 1; distance += 1) reached.push(dilateSquare(ink, width, height, distance));
  const shells = reached.slice(1).map((outer, index) => {
    const shell = new Uint8Array(width * height);
    for (let pixel = 0; pixel < shell.length; pixel += 1) shell[pixel] = outer[pixel]! & (reached[index]![pixel]! ^ 1);
    return rgbOf(shell);
  });
  const luma = ([red, green, blue]: readonly number[]) => 0.299 * red! + 0.587 * green! + 0.114 * blue!;
  const apart = (a: readonly number[], b: readonly number[]) => a.some((value, channel) => Math.abs(value - b[channel]!) >= outlineContrast);
  const paperShell = shells[maxGrow]!;
  let outlineEnd = minGrowPixels;
  while (outlineEnd < maxGrow && Math.abs(luma(shells[outlineEnd]!) - luma(paperShell)) >= paperToneTolerance) outlineEnd += 1;
  const grow = shells.slice(minGrowPixels, outlineEnd).some((shell) => apart(shell, paperShell)) ? outlineEnd : minGrowPixels;
  const grown = reached[grow]!.slice();
  const limit = dilateSquare(reachMask, width, height, grow);
  let strokePixels = 0;
  for (let index = 0; index < grown.length; index += 1) {
    grown[index] = grown[index]! & limit[index]!;
    strokePixels += grown[index]!;
  }

  // The paper next to the strokes: what a fill has to match, and whether it carries fine texture.
  const around = dilateSquare(grown, width, height, paperBandPixels);
  const band = new Uint8Array(width * height);
  let detailSum = 0;
  let detailCount = 0;
  for (let index = 0; index < band.length; index += 1) {
    if (grown[index] || !around[index]) continue;
    band[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
    if (grown[index - 1] || grown[index + 1] || grown[index - width] || grown[index + width]) continue;
    detailSum += Math.abs(at(index) - (at(index - 1) + at(index + 1) + at(index - width) + at(index + width)) / 4);
    detailCount += 1;
  }
  const ringMedian = rgbOf(band);

  // The stroke colour comes from the half of the stroke pixels furthest from the paper: edge pixels are blends.
  const strokes = lineInk.map((value, index) => (value && !glyphFill[index] ? 1 : 0));
  const strokeLuma: number[] = [];
  for (let index = 0; index < strokes.length; index += 1) if (strokes[index]) strokeLuma.push(at(index));
  const strokeMiddle = median(strokeLuma);
  const darkStrokes = strokeMiddle <= luma(ringMedian);
  const strokeMedian = rgbOf(strokes.map((value, index) => (value && (darkStrokes ? at(index) <= strokeMiddle : at(index) >= strokeMiddle) ? 1 : 0)));
  let fillPixels = 0;
  for (let index = 0; index < glyphFill.length; index += 1) fillPixels += glyphFill[index]!;
  // Strokes that enclose a fill of another tone are the outline of the glyphs, and the fill is their ink.
  // Otherwise the strokes are the ink, and what the mask grew over beyond anti-aliasing is an outline when
  // it is neither the paper nor the ink.
  const outlinedFill = fillPixels >= outlinedFillShare * strokeLuma.length;
  const halo = shells[minGrowPixels - 1]!;
  const inkMedian = outlinedFill ? rgbOf(glyphFill) : strokeMedian;
  const outlineMedian = outlinedFill ? strokeMedian : grow > minGrowPixels && apart(halo, ringMedian) && apart(halo, strokeMedian) ? halo : null;

  return {
    window,
    stroke: grown,
    inkMedian,
    outlineMedian,
    ringMedian,
    ringDetail: detailCount === 0 ? 0 : detailSum / detailCount,
    strokePixels,
  };
};

/** The lines of one dialogue are set in one ink: their colours agree within this much on every channel. */
const sameInkTolerance = 48;

/** True when two groups of lines are set in the same ink, or the ink of one of them cannot be measured. */
export const sameTextInk = (rgb: RgbImage, gray: GrayImage, first: readonly TextLine[], second: readonly TextLine[]) => {
  const one = regionTextMask(rgb, gray, first)?.inkMedian;
  const other = regionTextMask(rgb, gray, second)?.inkMedian;
  return !one || !other || one.every((value, channel) => Math.abs(value - other[channel]!) <= sameInkTolerance);
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
