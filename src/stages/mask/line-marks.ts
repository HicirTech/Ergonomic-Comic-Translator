import type { Box } from "../../geometry/interfaces/index.ts";
import { labelComponents } from "../../imaging/components.ts";

/** A mark is at most this large, in line thicknesses: a dot, a dash, a small kana, not a line of text or art. */
export const markSideShare = 1.2;
/**
 * A mark beside a line, off its extent across the line (ruby, an emphasis dot), is at most this large, in
 * line thicknesses; a glyph of the next row of a list, as close to the line as a dot, is larger. Along the
 * line a mark may be glyph-sized: a glyph the detector's rectangle ended before.
 */
const markBesideSideShare = 0.5;
/** A mark sits this close to a line or to a mark already taken, in line thicknesses. */
const markGapShare = 1.2;

const gapBetween = (a: Box, b: Box) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

/**
 * Whether `box` lies along one of the lines, however far: its centre lies within that line's extent across
 * the line. A glyph the rectangle ended before may stand a leader of dots away from it. The lines run the
 * way the longest of them does: a rectangle around one glyph is as tall as it is wide.
 */
const alongSomeLine = (box: Box, lineBoxes: readonly Box[]) => {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const side = (line: Box) => Math.max(line.x1 - line.x0, line.y1 - line.y0);
  const longest = lineBoxes.reduce<Box | null>((best, line) => (best === null || side(line) > side(best) ? line : best), null);
  if (longest === null) return false;
  const horizontal = longest.x1 - longest.x0 >= longest.y1 - longest.y0;
  return lineBoxes.some((line) => (horizontal ? cy >= line.y0 && cy <= line.y1 : cx >= line.x0 && cx <= line.x1));
};

/**
 * Among the ink-coloured blobs around the lines of a region, the ones that belong to its text: glyph parts
 * that stick out of their line rectangle, and small marks that continue a line or sit beside it (dot leaders
 * the line detector cut off, emphasis dots, ruby). All masks share one window: `candidate` is ink outside the
 * line rectangles, `zone` where marks are looked for, `core` the line rectangles. A blob that reaches the rim
 * of the zone, or is larger than a glyph, belongs to something else (a bubble outline, artwork) and is left
 * alone.
 */
export const keepLineMarks = (
  candidate: Uint8Array,
  zone: Uint8Array,
  core: Uint8Array,
  width: number,
  height: number,
  lineBoxes: readonly Box[],
  thickness: number,
) => {
  const { labels, components } = labelComponents(candidate, width, height);
  const touchesCore = new Uint8Array(components.length);
  const leavesZone = new Uint8Array(components.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const label = labels[index]!;
      if (!label) continue;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        leavesZone[label - 1] = 1;
        continue;
      }
      for (const other of [index - 1, index + 1, index - width, index + width]) {
        if (core[other]) touchesCore[label - 1] = 1;
        else if (!zone[other]) leavesZone[label - 1] = 1;
      }
    }
  }

  // Larger than a glyph is not a mark, also when it touches a line: a bubble outline hugging the text.
  const kept = new Uint8Array(components.length);
  const pending: number[] = [];
  components.forEach((component, index) => {
    if (leavesZone[index]) return;
    const side = Math.max(component.box.x1 - component.box.x0, component.box.y1 - component.box.y0);
    if (side > markSideShare * thickness) return;
    if (touchesCore[index]) kept[index] = 1;
    else if (alongSomeLine(component.box, lineBoxes) || side <= markBesideSideShare * thickness) pending.push(index);
  });
  // A leader is a chain: every dot is close to the line or to a dot already taken.
  const gapLimit = markGapShare * thickness;
  let grew = true;
  while (grew) {
    grew = false;
    for (const index of pending) {
      if (kept[index]) continue;
      const box = components[index]!.box;
      const near = lineBoxes.some((line) => gapBetween(box, line) <= gapLimit)
        || components.some((other, otherIndex) => kept[otherIndex] && !touchesCore[otherIndex] && gapBetween(box, other.box) <= gapLimit);
      if (near) {
        kept[index] = 1;
        grew = true;
      }
    }
  }

  const marks = new Uint8Array(width * height);
  for (let index = 0; index < marks.length; index += 1) {
    const label = labels[index]!;
    if (label && kept[label - 1]) marks[index] = 1;
  }
  return marks;
};
