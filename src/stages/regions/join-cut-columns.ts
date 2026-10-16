import { lineAngleDistance } from "../../geometry/angle.ts";
import { intersectionArea, unionBox } from "../../geometry/box.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import { rectCorners } from "../../geometry/rotated-rect.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import { textThickness } from "../lines/text-thickness.ts";
import type { PageRegion } from "./interfaces/index.ts";

/** A rectangle at least this wide for its length is a block the detector drew around several lines, not a line. */
const blockShortShare = 0.6;
/** Lines within this many degrees of upright are drawn on along their axis. */
const uprightDegrees = 10;
/** The block may stand this share of the lines' thickness away from their region along the axis. */
const gapShare = 1;
/** The block and the lines' region overlap across the axis by at least this share of the narrower one. */
const acrossOverlapShare = 0.5;
/** A block holding this share of a thickness square of the lines' ink holds a glyph of their text. */
const glyphInkShare = 0.25;

const isBlock = (line: TextLine) => line.rect.short >= blockShortShare * line.rect.long;

/** Whether a region's lines are all blocks: what the detector draws around text that lettering across the bubble cuts. */
export const isBlockRegion = (region: PageRegion) => region.lines.length > 0 && region.lines.every(isBlock);

const axisOf = (line: TextLine) =>
  lineAngleDistance(line.rect.angle, 0) <= uprightDegrees ? "x" : lineAngleDistance(line.rect.angle, 90) <= uprightDegrees ? "y" : null;

const span = (box: Box, axis: "x" | "y"): [number, number] => (axis === "x" ? [box.x0, box.x1] : [box.y0, box.y1]);

/** The same bubble, or two bubbles the detector found where lettering across one bubble cut it in two. */
const sameBubble = (host: PageRegion, block: PageRegion) =>
  host.bubble !== null && block.bubble !== null && (host.bubble === block.bubble || intersectionArea(host.bubble, block.bubble) > 0);

const inTheWay = (host: PageRegion, block: PageRegion, axis: "x" | "y") => {
  const thickness = textThickness(host.lines) ?? host.lines[0]!.rect.short;
  const [hostStart, hostEnd] = span(host.box, axis);
  const [blockStart, blockEnd] = span(block.box, axis);
  const gap = Math.max(blockStart - hostEnd, hostStart - blockEnd);
  const [hostAcross0, hostAcross1] = span(host.box, axis === "x" ? "y" : "x");
  const [blockAcross0, blockAcross1] = span(block.box, axis === "x" ? "y" : "x");
  const overlap = Math.min(hostAcross1, blockAcross1) - Math.max(hostAcross0, blockAcross0);
  return gap <= gapShare * thickness && overlap >= acrossOverlapShare * Math.min(hostAcross1 - hostAcross0, blockAcross1 - blockAcross0);
};

/** The line drawn on along its axis to cover the box. */
const drawnOver = (line: TextLine, box: Box, axis: "x" | "y"): TextLine => {
  const half = line.rect.long / 2;
  const [boxStart, boxEnd] = span(box, axis);
  const start = Math.min((axis === "x" ? line.rect.center.x : line.rect.center.y) - half, boxStart);
  const end = Math.max((axis === "x" ? line.rect.center.x : line.rect.center.y) + half, boxEnd);
  const center = axis === "x" ? { x: (start + end) / 2, y: line.rect.center.y } : { x: line.rect.center.x, y: (start + end) / 2 };
  const rect = { center, long: end - start, short: line.rect.short, angle: line.rect.angle };
  return { ...line, rect, quad: rectCorners(rect) };
};

/**
 * Joins a region that is the rest of another region's lines. Lettering drawn across a bubble cuts the
 * lines of its dialogue: the detector finds the parts on one side as lines and draws one block around the
 * parts on the other side, which reads as nothing, so the dialogue loses its ending and the block stays
 * on the page. A region whose lines are all blocks, in the bubble of a region of upright lines (or in a
 * bubble the detector found overlapping it: the lettering cuts the bubble in two as well), in the way of
 * those lines and holding a glyph's worth of their ink (`holdsInk(block, host, pixels)`), is their rest:
 * the lines are drawn on over the block's box, the bubble over the block's bubble, and the block region goes.
 */
export const joinCutColumns = (
  regions: readonly PageRegion[],
  holdsInk: (block: PageRegion, host: PageRegion, minPixels: number) => boolean,
): PageRegion[] => {
  const joined = regions.map((region) => ({ ...region, lines: [...region.lines] }));
  const dropped = new Set<number>();
  joined.forEach((block, blockIndex) => {
    if (block.bubble === null || !isBlockRegion(block)) return;
    const hostIndex = joined.findIndex((host, index) => {
      if (index === blockIndex || dropped.has(index) || !sameBubble(host, block) || host.lines.length === 0) return false;
      const axis = axisOf(host.lines[0]!);
      if (axis === null || !host.lines.every((line) => !isBlock(line) && axisOf(line) === axis) || !inTheWay(host, block, axis)) return false;
      const thickness = textThickness(host.lines) ?? host.lines[0]!.rect.short;
      return holdsInk(block, host, glyphInkShare * thickness * thickness);
    });
    if (hostIndex < 0) return;
    const host = joined[hostIndex]!;
    const axis = axisOf(host.lines[0]!)!;
    host.lines = host.lines.map((line) => drawnOver(line, block.box, axis));
    host.box = unionBox([host.box, block.box]);
    if (host.bubble !== block.bubble) host.bubble = unionBox([host.bubble!, block.bubble!]);
    dropped.add(blockIndex);
  });
  return joined.filter((_region, index) => !dropped.has(index));
};
