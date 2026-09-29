import type { Box } from "../../geometry/interfaces/index.ts";

/** Boxes are shrunk by this share per side before projecting, so bubbles that barely touch still separate. */
const shrinkShare = 0.05;

type Axis = "x" | "y";

const span = (box: Box, axis: Axis) => {
  const low = axis === "x" ? box.x0 : box.y0;
  const high = axis === "x" ? box.x1 : box.y1;
  const inset = (high - low) * shrinkShare;
  return [low + inset, high - inset] as const;
};

/** Groups indices into runs separated by empty stretches along one axis, in increasing coordinate order. */
const splitByGaps = (indices: readonly number[], boxes: readonly Box[], axis: Axis) => {
  const sorted = [...indices].sort((a, b) => span(boxes[a]!, axis)[0] - span(boxes[b]!, axis)[0]);
  const groups: number[][] = [];
  let reach = -Infinity;
  for (const index of sorted) {
    const [low, high] = span(boxes[index]!, axis);
    if (groups.length === 0 || low > reach) {
      groups.push([index]);
    } else {
      groups[groups.length - 1]!.push(index);
    }
    reach = Math.max(reach, high);
  }
  return groups;
};

/**
 * S3 reading order by recursive XY-cut: split into horizontal bands top to bottom first, then into
 * columns right to left (manga) or left to right, recursing until no cut is possible; overlapping leftovers
 * fall back to top edge, then the reading direction. Returns indices into `boxes`.
 */
export const readingOrder = (boxes: readonly Box[], direction: "rtl" | "ltr"): number[] => {
  const order = (indices: number[]): number[] => {
    if (indices.length <= 1) return indices;
    const bands = splitByGaps(indices, boxes, "y");
    if (bands.length > 1) return bands.flatMap(order);
    const columns = splitByGaps(indices, boxes, "x");
    if (columns.length > 1) return (direction === "rtl" ? columns.reverse() : columns).flatMap(order);
    return [...indices].sort((a, b) =>
      boxes[a]!.y0 - boxes[b]!.y0 || (direction === "rtl" ? boxes[b]!.x1 - boxes[a]!.x1 : boxes[a]!.x0 - boxes[b]!.x0));
  };
  return order(boxes.map((_, index) => index));
};
