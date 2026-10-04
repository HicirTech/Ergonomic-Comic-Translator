import { lineAngleDistance } from "../../geometry/angle.ts";
import { boundingBoxOfPoints, coverage, iou } from "../../geometry/box.ts";
import type { Point } from "../../geometry/interfaces/index.ts";
import { rectCorners, rotatePoint } from "../../geometry/rotated-rect.ts";
import type { TextLine } from "../lines/interfaces/index.ts";

/**
 * Two detections of one line overlap at least this much. Measured after turning both rectangles
 * upright with the kept line, so parallel slanted lines (whose page boxes overlap) stay.
 */
const duplicateLineIou = 0.5;
/** A line with this share of its rectangle inside another line's rectangle shows text of that line. */
const containedShare = 0.7;
/** A contained line at least this long, relative to its holder, is the same line found twice; a shorter one is a piece of it. */
const sameLengthShare = 0.7;
/** Lines whose directions differ by more than this are different lines. */
const sameDirectionDegrees = 15;
/** A piece is about as thick as the line it is a piece of. */
const pieceThicknessShare = 0.6;
/**
 * A rectangle around a block of text holds this many of its lines, each much thinner than the rectangle
 * (the complement of `pieceThicknessShare`) and at least this share of its length.
 */
const blockLines = 2;
const blockLineLengthShare = 0.5;

/** Both rectangles as boxes in the reference line's frame. Equal angles make them axis-aligned. */
const uprightBoxes = (reference: TextLine, other: TextLine) => {
  const center = reference.rect.center;
  const angle = -reference.rect.angle;
  const boxOf = (item: TextLine) => boundingBoxOfPoints(rectCorners(item.rect).map((point) => rotatePoint(point, center, angle)));
  return { reference: boxOf(reference), other: boxOf(other) };
};

const uprightIou = (kept: TextLine, line: TextLine) => {
  const boxes = uprightBoxes(kept, line);
  return iou(boxes.reference, boxes.other);
};

/** True when most of `inner` lies inside `outer` and both run the same way. */
const holds = (outer: TextLine, inner: TextLine) => {
  if (lineAngleDistance(outer.rect.angle, inner.rect.angle) > sameDirectionDegrees) return false;
  const boxes = uprightBoxes(outer, inner);
  return coverage(boxes.other, boxes.reference) >= containedShare;
};

/** `line` stretched along its own axis so that it also spans `other`; its thickness and direction stay. */
const stretchedOver = (line: TextLine, other: TextLine): TextLine => {
  const radians = (line.rect.angle * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const along = (point: Point) => (point.x - line.rect.center.x) * ux + (point.y - line.rect.center.y) * uy;
  const reach = [...rectCorners(other.rect).map(along), -line.rect.long / 2, line.rect.long / 2];
  const low = Math.min(...reach);
  const high = Math.max(...reach);
  const middle = (low + high) / 2;
  const rect = { ...line.rect, center: { x: line.rect.center.x + middle * ux, y: line.rect.center.y + middle * uy }, long: high - low };
  return { ...line, rect, quad: rectCorners(rect) };
};

/**
 * One rectangle per text line out of the crop pass and the page pass together.
 * - The same rectangle twice: the more confident one stays.
 * - The same line with two thicknesses (DB draws a thick rectangle in a cramped crop): the thin one stays,
 *   stretched to the length of the thick one, which may reach a trailing mark the thin one cut off.
 * - A rectangle around a block of lines (DB draws one around the whole text of a cramped crop): the block
 *   goes and its lines stay as they are. Taken for a line, its rectangle reaches over what stands beside
 *   the text, the frame of a dialogue box or art lettering, and the mask erases that as ink.
 * - A piece of a longer line (the page pass breaks a line at wide gaps): the piece goes.
 * Without this the joined line readings of a region repeat text.
 */
export const dedupeLines = (lines: readonly TextLine[]) => {
  const distinct: TextLine[] = [];
  for (const line of [...lines].sort((a, b) => b.score - a.score)) {
    if (!distinct.some((other) => uprightIou(other, line) > duplicateLineIou)) distinct.push(line);
  }

  const thick = new Set<TextLine>();
  const stretched = new Map<TextLine, TextLine>();
  for (const outer of distinct) {
    const held = distinct.filter((inner) => inner !== outer && inner.rect.short < outer.rect.short && holds(outer, inner));
    const blockOf = held.filter((inner) =>
      inner.rect.short <= pieceThicknessShare * outer.rect.short && inner.rect.long >= blockLineLengthShare * outer.rect.long);
    if (blockOf.length >= blockLines) {
      thick.add(outer);
      continue;
    }
    const twins = held.filter((inner) => inner.rect.long >= sameLengthShare * outer.rect.long);
    if (twins.length === 0) continue;
    thick.add(outer);
    for (const twin of twins) stretched.set(twin, stretchedOver(stretched.get(twin) ?? twin, outer));
  }
  const tight = distinct.filter((line) => !thick.has(line)).map((line) => stretched.get(line) ?? line);

  return tight.filter((line) => !tight.some((outer) =>
    outer !== line
    && line.rect.long < sameLengthShare * outer.rect.long
    && Math.min(line.rect.short, outer.rect.short) >= pieceThicknessShare * Math.max(line.rect.short, outer.rect.short)
    && holds(outer, line)));
};
