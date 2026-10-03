import type { Box } from "../../geometry/interfaces/index.ts";
import { labelComponents } from "../../imaging/components.ts";

/** A mark is at most this large, in line thicknesses: a dot, a dash, a small kana, not a line of text or art. */
const markSideShare = 1.2;
/** A mark sits this close to a line or to a mark already taken, in line thicknesses. */
const markGapShare = 1.2;

const gapBetween = (a: Box, b: Box) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

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
    if (Math.max(component.box.x1 - component.box.x0, component.box.y1 - component.box.y0) > markSideShare * thickness) return;
    if (touchesCore[index]) kept[index] = 1;
    else pending.push(index);
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
