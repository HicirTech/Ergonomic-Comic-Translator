/**
 * A frame line inks at least this share of a row or column of a line rectangle. Text does not: glyphs end
 * inside their rectangle, and the tallest stroke measured on two volumes covers 0.86 of its thickness.
 */
const throughShare = 0.9;
/** The soft edge of a frame line inks at least this share of the rows or columns next to it. */
const edgeShare = 0.5;

/**
 * The ink of a line rectangle that runs straight through it, along a row or a column, from one edge to the
 * other and on past the rectangle: the frame of a dialogue box or a panel border that the rectangle reaches
 * over. `polygon` is the rectangle, `ink` its ink, both in a window of `width` x `height`; `goesOn` tells
 * whether a pixel outside the rectangle is ink that goes on for more than a glyph (a glyph set larger than
 * its line also fills the rectangle from edge to edge, and what sticks out of it is small). Meant for upright
 * rectangles: in a slanted one no row or column runs from edge to edge.
 */
export const throughRuns = (polygon: Uint8Array, ink: Uint8Array, goesOn: (index: number) => boolean, width: number, height: number) => {
  const through = new Uint8Array(polygon.length);
  /** `lanes` rows or columns of `length` pixels each; `at(lane, position)` is the pixel index. */
  const sweep = (lanes: number, length: number, at: (lane: number, position: number) => number) => {
    const share = new Float32Array(lanes);
    const runsThrough = new Uint8Array(lanes);
    for (let lane = 0; lane < lanes; lane += 1) {
      let first = -1;
      let last = -1;
      let inked = 0;
      for (let position = 0; position < length; position += 1) {
        const index = at(lane, position);
        if (!polygon[index]) continue;
        if (first < 0) first = position;
        last = position;
        inked += ink[index]!;
      }
      if (first < 0) continue;
      share[lane] = inked / (last - first + 1);
      const runsOn = (first > 0 && goesOn(at(lane, first - 1))) || (last < length - 1 && goesOn(at(lane, last + 1)));
      if (share[lane]! >= throughShare && runsOn) runsThrough[lane] = 1;
    }
    // The line's soft edges: the lanes beside it that are mostly inked.
    for (const step of [1, -1]) {
      for (let lane = step > 0 ? 1 : lanes - 2; lane >= 0 && lane < lanes; lane += step) {
        if (!runsThrough[lane] && runsThrough[lane - step] && share[lane]! >= edgeShare) runsThrough[lane] = 1;
      }
    }
    for (let lane = 0; lane < lanes; lane += 1) {
      if (!runsThrough[lane]) continue;
      for (let position = 0; position < length; position += 1) {
        const index = at(lane, position);
        if (polygon[index] && ink[index]) through[index] = 1;
      }
    }
  };
  sweep(width, height, (x, y) => y * width + x);
  sweep(height, width, (y, x) => y * width + x);
  return through;
};
