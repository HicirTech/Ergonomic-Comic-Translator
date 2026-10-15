import { lineAngleDistance } from "../../geometry/angle.ts";
import { boundingBoxOfPoints, clampToImage, expandBox } from "../../geometry/box.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import { rasterizeConvexQuad } from "../../geometry/raster.ts";
import { rectCorners } from "../../geometry/rotated-rect.ts";
import { labelComponents } from "../../imaging/components.ts";
import type { GrayImage, RgbImage } from "../../imaging/interfaces/index.ts";
import { dilateSquare, erodeSquare } from "../../imaging/morphology.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import { textThickness } from "../lines/text-thickness.ts";
import { faintRunsOut } from "./faint-runs.ts";
import { inkHeight } from "./ink-height.ts";
import { isColoured, sameInk } from "./ink.ts";
import type { RegionMask } from "./interfaces/index.ts";
import { keepLineMarks, markSideShare } from "./line-marks.ts";
import { edgeBandOf, inkSide } from "./line-tone.ts";
import { throughRuns } from "./through-runs.ts";

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
/** A rectangle within this many degrees of level or plumb has rows and columns that run from edge to edge. */
const uprightWithinDegrees = 5;
/**
 * Solid ink lies on the text's side of this share of the way from the line's ink tone to its threshold;
 * what lies beyond is faint: the soft rim of a glyph, or a line that is not text at all.
 */
const faintShare = 0.5;
/**
 * An outline differs from the paper and from the ink by at least this much on some channel. Less than that
 * around the text is not taken for one: measured on one volume against its textless pages, the paper is up
 * to 29 levels lighter next to the dialogue than 10 px away with nothing drawn around the glyphs (the
 * artwork is lighter where the text was placed), and a mask grown over that leaves a band.
 */
const outlineContrast = 48;
/**
 * For free text the paper is read this far out, in line thicknesses: an outline drawn wider than the mask
 * may grow has ended there. In a bubble it is read just past that growth: further out may lie beyond the
 * bubble.
 */
const paperSearchShare = 0.3;
/**
 * The band of an outline is taken as far as this share of the thickness from the strokes, and never further
 * than twice the width the shells gave it: a shape of the outline's colour that touches the band is artwork.
 */
const bandReachShare = 0.5;
/** A pixel this close to the outline's colour on every channel is its band; below outlineContrast, so paper never is. */
const bandTolerance = 40;
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
 * Strokes in a second tone amounting to this share of them are the glyphs, and the first tone their edge
 * (a pink fill edged in white on a dark page reads as one light side). Blends of ink and paper lie on the
 * line between the two colours and are never that second tone.
 */
const secondToneShare = 0.2;
/** A second tone that touches the paper over more than this share of its pixels is lettering drawn across the text, not a fill. */
const secondToneOpenShare = 0.2;
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

/** Distance of a colour from the segment between two colours, in RGB levels. */
const awayFromBlend = (colour: readonly number[], from: readonly number[], to: readonly number[]) => {
  const span = to.map((value, channel) => value - from[channel]!);
  const length = span.reduce((sum, value) => sum + value * value, 0);
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, colour.reduce((sum, value, channel) => sum + (value - from[channel]!) * span[channel]!, 0) / length));
  return Math.sqrt(colour.reduce((sum, value, channel) => sum + (value - from[channel]! - along * span[channel]!) ** 2, 0));
};

/** The pixels for which `wanted` holds that are connected (8-neighbourhood) to the set pixels of `seed`, within `reach`. */
const floodFrom = (seed: Uint8Array, reach: Uint8Array, wanted: (index: number) => boolean, width: number, height: number) => {
  const found = new Uint8Array(seed.length);
  const stack: number[] = [];
  for (let index = 0; index < seed.length; index += 1) if (seed[index]) stack.push(index);
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seed[next] || found[next] || !reach[next] || !wanted(next)) continue;
        found[next] = 1;
        stack.push(next);
      }
    }
  }
  return found;
};

/**
 * S5: text strokes of one region. Inside each unclipped (possibly rotated) line polygon, Otsu separates
 * ink from paper; the side away from that line's paper tone (read inside the bubble, when there is one)
 * is the text, so dark-on-light and light-on-dark both work, also when one region holds both. Small blobs
 * of the same ink that continue a
 * line or sit beside it are text too (keepLineMarks); with a `bubble` they are only looked for inside it,
 * and what a line rectangle holds of the bubble's frame, or of the picture beyond the bubble, is not text.
 * The grown mask never leaves the neighbourhood of the lines and their marks.
 */
export const regionTextMask = (rgb: RgbImage, gray: GrayImage, lines: readonly TextLine[], bubble: Box | null = null): RegionMask | null => {
  const thickness = textThickness(lines);
  if (thickness === null) {
    return null;
  }
  const maxGrow = Math.max(minGrowPixels, Math.round(maxGrowShare * thickness));
  const glyphSide = markSideShare * thickness;
  const edgeBand = edgeBandOf(thickness);
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
  // Ink-toned pixels that are not text, whatever their colour: around the line rectangles, and the frame
  // lines that run through them. What the ink in a rectangle runs on into.
  const inkAround = new Uint8Array(width * height);
  // The pixels on the paper side of a line's threshold, in its rectangle and its zone.
  const paperSide = new Uint8Array(width * height);
  linePolygons.forEach((linePolygon, lineIndex) => {
    const withEdge = dilateSquare(linePolygon, width, height, edgeBand);
    const inside: number[] = [];
    const own: number[] = [];
    const ownInBubble: number[] = [];
    for (let index = 0; index < linePolygon.length; index += 1) {
      if (linePolygon[index]) inside.push(at(index));
      if (!withEdge[index]) continue;
      own.push(at(index));
      if (inBubble(index)) ownInBubble.push(at(index));
    }
    if (inside.length === 0) return;
    // A line's paper is its bubble's: what its band holds beyond the bubble is the page, not paper.
    const { threshold, paper, darkText } = inkSide(inside, ownInBubble.length > 0 ? ownInBubble : own);
    const isInk = (index: number) => (darkText ? at(index) <= threshold : at(index) > threshold);
    const ownInk = linePolygon.map((value, index) => (value && isInk(index) ? 1 : 0));
    const notText = (found: Uint8Array) => {
      for (let index = 0; index < ownInk.length; index += 1) {
        if (!found[index]) continue;
        ownInk[index] = 0;
        inkAround[index] = 1;
      }
    };
    // What runs straight through an upright rectangle and on into more than a glyph is a frame the rectangle
    // reaches over.
    const { angle } = lines[lineIndex]!.rect;
    if (Math.min(lineAngleDistance(angle, 0), lineAngleDistance(angle, 90)) <= uprightWithinDegrees) {
      const beside = labelComponents(linePolygon.map((value, index) => (!value && isInk(index) ? 1 : 0)), width, height);
      const goesOn = beside.components.map(({ box }) =>
        Math.max(box.x1 - box.x0, box.y1 - box.y0) > glyphSide || box.x0 === 0 || box.y0 === 0 || box.x1 === width || box.y1 === height);
      notText(throughRuns(linePolygon, ownInk, (index) => beside.labels[index]! > 0 && goesOn[beside.labels[index]! - 1]!, width, height));
    }
    // Marks are set in the line's own ink: a blob of another colour is artwork, however dark.
    const lineInkRgb = rgbOf(ownInk);
    // In a bubble, ink of another colour than the line's is not its text either: the page where the
    // rectangle reaches beyond the bubble's shape, the bubble's frame, or lettering drawn across the bubble.
    // The line's colour is the one that most pixels of its glyph-sized pieces within the rectangle and inside
    // the bubble agree on (the page enters at the rectangle's edge and beyond the bubble, and art drawn over
    // the bubble is larger than a glyph): the colour of one piece, never a blend of theirs. Whole pieces are
    // judged, so the blended edges of the glyphs stay with them, and a colour against black, white or grey,
    // or two colours apart, tells them, not a lighter grey of a thin mark.
    if (bubble) {
      const pieces = labelComponents(ownInk, width, height);
      const within = pieces.components.map((component) => (Math.max(component.box.x1 - component.box.x0, component.box.y1 - component.box.y0) <= glyphSide ? 1 : 0));
      const channels = pieces.components.map((): [number[], number[], number[]] => [[], [], []]);
      for (let index = 0; index < ownInk.length; index += 1) {
        const label = pieces.labels[index]!;
        if (!label) continue;
        const x = index % width;
        const y = Math.floor(index / width);
        if (!inBubble(index) || x === 0 || y === 0 || x === width - 1 || y === height - 1
          || !linePolygon[index - 1] || !linePolygon[index + 1] || !linePolygon[index - width] || !linePolygon[index + width]) within[label - 1] = 0;
        const offset = pageIndex(index) * 3;
        for (let channel = 0; channel < 3; channel += 1) channels[label - 1]![channel]!.push(rgb.data[offset + channel]!);
      }
      const colours = channels.map((piece): [number, number, number] => [median(piece[0]), median(piece[1]), median(piece[2])]);
      const unlike = (colour: [number, number, number], other: [number, number, number]) =>
        isColoured(colour) !== isColoured(other) || (isColoured(colour) && !sameInk(colour, other));
      let reference = lineInkRgb;
      let agreeing = 0;
      colours.forEach((colour, label) => {
        if (!within[label]) return;
        const pixels = colours.reduce((sum, other, otherLabel) => sum + (within[otherLabel] && !unlike(other, colour) ? pieces.components[otherLabel]!.pixels : 0), 0);
        if (pixels > agreeing) {
          agreeing = pixels;
          reference = colour;
        }
      });
      notText(ownInk.map((value, index) => (value && unlike(colours[pieces.labels[index]! - 1]!, reference) ? 1 : 0)));
    }
    // So is faint ink that runs on into such a frame, or out of the region's rectangles.
    const inkTone = median(Array.from(ownInk.keys()).filter((index) => ownInk[index]).map(at));
    const solidUpTo = inkTone + faintShare * (threshold - inkTone);
    const faint = ownInk.map((value, index) => (value && (darkText ? at(index) > solidUpTo : at(index) < solidUpTo) ? 1 : 0));
    const solid = ownInk.map((value, index) => (value && !faint[index] ? 1 : 0));
    const beyond = (index: number) => inkAround[index] === 1 || (!polygon[index] && isInk(index));
    notText(faintRunsOut(faint, solid, beyond, width, height));

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

    const hasLineInk = (index: number) => {
      const offset = pageIndex(index) * 3;
      return lineInkRgb.every((value, channel) => Math.abs(rgb.data[offset + channel]! - value) <= markInkTolerance);
    };
    const lineZone = rasterized(zoneQuads[lineIndex]!);
    for (let index = 0; index < linePolygon.length; index += 1) {
      if ((linePolygon[index] || lineZone[index]) && !isInk(index)) paperSide[index] = 1;
      if (linePolygon[index]) {
        if (ownInk[index]) ink[index] = 1;
        continue;
      }
      if (!lineZone[index]) continue;
      if (!polygon[index] && isInk(index)) inkAround[index] = 1;
      if (inBubble(index)) {
        zone[index] = 1;
        if (!polygon[index] && isInk(index) && hasLineInk(index)) candidate[index] = 1;
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
  // The band along a bubble's edge holds its frame, and beyond the bubble lies another surface; a line
  // rectangle larger than its text reaches over both. A piece of ink that lies mostly there, and belongs to
  // a shape larger than a glyph when counted with what it runs on into, is the frame or the picture. Text
  // that touches the frame has most of its ink inside the bubble and stays text, with the bit of frame it
  // touches.
  if (bubble) {
    const shapes = labelComponents(ink.map((value, index) => value | inkAround[index]!), width, height);
    const largerThanGlyph = shapes.components.map((component) =>
      Math.max(component.box.x1 - component.box.x0, component.box.y1 - component.box.y0) > glyphSide);
    const pieces = labelComponents(ink, width, height);
    const inkInside = new Int32Array(pieces.components.length);
    const inkBeyond = new Int32Array(pieces.components.length);
    for (let index = 0; index < ink.length; index += 1) {
      const label = pieces.labels[index]!;
      if (!label) continue;
      if (inBubble(index)) inkInside[label - 1]! += 1;
      else inkBeyond[label - 1]! += 1;
    }
    for (let index = 0; index < ink.length; index += 1) {
      const label = pieces.labels[index]!;
      if (!label || inkBeyond[label - 1]! <= inkInside[label - 1]! || !largerThanGlyph[shapes.labels[index]! - 1]) continue;
      ink[index] = 0;
      glyphFill[index] = 0;
    }
  }
  const lineInk = ink.slice();
  const inkHeights = lines.map((line, lineIndex) => inkHeight(lineInk, linePolygons[lineIndex]!, line.rect.angle, width));

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

  // The shells around the ink, one pixel at a time; the one at the paper distance is the paper. An outline
  // lies against the ink: the shells from the ink outward that are not that paper yet, when one of them is
  // as far from it as an outline is. A shell further out that differs again is the background. The shells
  // are read around the lines' own ink: what surrounds a mark beside them says nothing about the glyphs' edge.
  const paperDistance = bubble ? maxGrow + 1 : Math.max(maxGrow + 1, Math.round(paperSearchShare * thickness));
  const reached: Uint8Array[] = [ink];
  const lineReached: Uint8Array[] = [lineInk];
  for (let distance = 1; distance <= paperDistance; distance += 1) {
    reached.push(dilateSquare(ink, width, height, distance));
    lineReached.push(dilateSquare(lineInk, width, height, distance));
  }
  const shellMasks = lineReached.slice(1).map((outer, index) => {
    const shell = new Uint8Array(width * height);
    for (let pixel = 0; pixel < shell.length; pixel += 1) shell[pixel] = outer[pixel]! & (lineReached[index]![pixel]! ^ 1);
    return shell;
  });
  const shells = shellMasks.map(rgbOf);
  const luma = ([red, green, blue]: readonly number[]) => 0.299 * red! + 0.587 * green! + 0.114 * blue!;
  const apart = (a: readonly number[], b: readonly number[]) => a.some((value, channel) => Math.abs(value - b[channel]!) >= outlineContrast);
  // A line in a bubble stands on the bubble's paper: its paper shell is read from the shell's pixels inside
  // the bubble on the paper side of the lines' thresholds. Art drawn over the bubble and the page beyond it
  // are ink-toned and say nothing about that paper. On open artwork the shell is read as it is: there the
  // band of an outline is as light as paper, and the ground beyond it is the paper.
  const paperShellPixels = bubble ? shellMasks[paperDistance - 1]!.map((value, index) => value & paperSide[index]! & (inBubble(index) ? 1 : 0)) : null;
  const paperShell = paperShellPixels?.some((value) => value === 1) ? rgbOf(paperShellPixels) : shells[paperDistance - 1]!;
  let outlineEnd = minGrowPixels;
  while (outlineEnd < paperDistance - 1 && Math.abs(luma(shells[outlineEnd]!) - luma(paperShell)) >= paperToneTolerance) outlineEnd += 1;
  const outlined = shells.slice(minGrowPixels, outlineEnd).some((shell) => apart(shell, paperShell));
  const grow = outlined ? Math.min(outlineEnd, maxGrow) : minGrowPixels;
  const grown = reached[grow]!.slice();
  const limit = dilateSquare(reachMask, width, height, grow);
  let strokePixels = 0;
  for (let index = 0; index < grown.length; index += 1) {
    grown[index] = grown[index]! & limit[index]!;
    strokePixels += grown[index]!;
  }

  // The stroke colour comes from the half of the stroke pixels furthest from the paper: edge pixels are blends.
  const strokes = lineInk.map((value, index) => (value && !glyphFill[index] ? 1 : 0));
  const strokeLuma: number[] = [];
  for (let index = 0; index < strokes.length; index += 1) if (strokes[index]) strokeLuma.push(at(index));
  const strokeMiddle = median(strokeLuma);
  const darkStrokes = strokeMiddle <= luma(paperShell);
  const strokeMedian = rgbOf(strokes.map((value, index) => (value && (darkStrokes ? at(index) <= strokeMiddle : at(index) >= strokeMiddle) ? 1 : 0)));
  let fillPixels = 0;
  for (let index = 0; index < glyphFill.length; index += 1) fillPixels += glyphFill[index]!;
  // Strokes that enclose a fill of another tone are the outline of the glyphs, and the fill is their ink.
  // Otherwise the strokes are the ink, and what the mask grew over beyond anti-aliasing is an outline when
  // it is neither the paper nor the ink.
  const outlinedFill = fillPixels >= outlinedFillShare * strokeLuma.length;
  const halo = shells[minGrowPixels - 1]!;
  let inkMedian = outlinedFill ? rgbOf(glyphFill) : strokeMedian;
  let outlineMedian = outlinedFill ? strokeMedian : outlined && apart(halo, paperShell) && apart(halo, strokeMedian) ? halo : null;
  if (outlineMedian === null && !outlinedFill) {
    const secondTone = strokes.map((value, index) => {
      if (!value) return 0;
      const offset = pageIndex(index) * 3;
      const colour = [rgb.data[offset]!, rgb.data[offset + 1]!, rgb.data[offset + 2]!] as const;
      return isColoured(colour) && awayFromBlend(colour, inkMedian, paperShell) >= outlineContrast ? 1 : 0;
    });
    let secondTonePixels = 0;
    let openPixels = 0;
    for (let index = 0; index < secondTone.length; index += 1) {
      if (!secondTone[index]) continue;
      secondTonePixels += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const onPaper = (x > 0 && !lineInk[index - 1]) || (x < width - 1 && !lineInk[index + 1]) || (y > 0 && !lineInk[index - width]) || (y < height - 1 && !lineInk[index + width]);
      if (onPaper) openPixels += 1;
    }
    if (secondTonePixels >= secondToneShare * strokeLuma.length && openPixels <= secondToneOpenShare * secondTonePixels) {
      outlineMedian = inkMedian;
      inkMedian = rgbOf(secondTone);
    }
  }

  // An outline drawn wider than the mask may grow: the pixels of its colour that touch the strokes, and one
  // more for their blended rim, go with the strokes, so the fill starts from the paper beyond the band.
  if (outlineMedian !== null && !outlinedFill) {
    const reach = dilateSquare(reachMask, width, height, Math.min(Math.round(bandReachShare * thickness), 2 * outlineEnd));
    const ofBand = (index: number) => {
      const offset = pageIndex(index) * 3;
      return outlineMedian.every((value, channel) => Math.abs(rgb.data[offset + channel]! - value) <= bandTolerance);
    };
    const band = floodFrom(grown, reach, ofBand, width, height);
    const rim = dilateSquare(band, width, height, 1);
    for (let index = 0; index < grown.length; index += 1) {
      if (grown[index] || !reach[index] || !(band[index] || rim[index])) continue;
      grown[index] = 1;
      strokePixels += 1;
    }
  }

  // The paper next to the strokes: the colour the lettering has to stand on.
  const around = dilateSquare(grown, width, height, paperBandPixels);
  const ringMedian = rgbOf(around.map((value, index) => value & (grown[index]! ^ 1)));

  return {
    window,
    stroke: grown,
    inkMedian,
    outlineMedian,
    ringMedian,
    strokePixels,
    inkHeights,
    hollow: outlinedFill,
  };
};

/** True when two groups of lines are set in the same ink, or the ink of one of them cannot be measured. */
export const sameTextInk = (rgb: RgbImage, gray: GrayImage, first: readonly TextLine[], second: readonly TextLine[]) => {
  const one = regionTextMask(rgb, gray, first)?.inkMedian;
  const other = regionTextMask(rgb, gray, second)?.inkMedian;
  return !one || !other || sameInk(one, other);
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
