import { labelComponents } from "../../imaging/components.ts";
import { dilateSquare } from "../../imaging/morphology.ts";

/**
 * A faint line passes the threshold in pieces: a piece continues another when it lies within twice this
 * many pixels of it.
 */
const pieceReachPixels = 2;

/**
 * The faint ink of a line rectangle that runs on into what is not text: ink that stays far lighter than the
 * text and leaves the text's rectangles, or joins a frame line already found, is the faint frame of a
 * dialogue box, its soft edge, or a line of the picture seen through a translucent box. `faint` and `solid`
 * are the two parts of the rectangle's ink, in a window of `width` x `height`; `beyond` tells whether a
 * pixel is ink-toned and not text. Pieces of faint ink are followed from there, one continuing the other.
 * A piece that touches solid ink is the rim of a glyph the line meets: it is taken too, since the rim grows
 * back around the solid ink with the mask, but nothing is followed past it.
 */
export const faintRunsOut = (faint: Uint8Array, solid: Uint8Array, beyond: (index: number) => boolean, width: number, height: number) => {
  const { labels, components } = labelComponents(faint, width, height);
  const meetsSolid = new Uint8Array(components.length);
  const meetsBeyond = new Uint8Array(components.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const label = labels[y * width + x]!;
      if (!label) continue;
      for (let otherY = Math.max(0, y - 1); otherY <= Math.min(height - 1, y + 1); otherY += 1) {
        for (let otherX = Math.max(0, x - 1); otherX <= Math.min(width - 1, x + 1); otherX += 1) {
          const other = otherY * width + otherX;
          if (solid[other]) meetsSolid[label - 1] = 1;
          else if (!faint[other] && beyond(other)) meetsBeyond[label - 1] = 1;
        }
      }
    }
  }
  // The pieces that touch no glyph, in groups of pieces that continue one another.
  const free = faint.map((value, index) => (value && !meetsSolid[labels[index]! - 1] ? 1 : 0));
  const groups = labelComponents(dilateSquare(free, width, height, pieceReachPixels), width, height);
  const groupRunsOut = new Uint8Array(groups.components.length);
  for (let index = 0; index < free.length; index += 1) {
    if (free[index] && meetsBeyond[labels[index]! - 1]) groupRunsOut[groups.labels[index]! - 1] = 1;
  }
  const taken = new Uint8Array(components.length);
  for (let index = 0; index < free.length; index += 1) {
    if (free[index] && groupRunsOut[groups.labels[index]! - 1]) taken[labels[index]! - 1] = 1;
  }
  // The rims the line meets: beside a piece that was taken, or beside what is not text.
  for (let index = 0; index < faint.length; index += 1) {
    const label = labels[index]!;
    if (!label || !meetsSolid[label - 1]) continue;
    const group = groups.labels[index]!;
    if (meetsBeyond[label - 1] || (group && groupRunsOut[group - 1])) taken[label - 1] = 1;
  }
  return faint.map((value, index) => (value && taken[labels[index]! - 1] ? 1 : 0));
};
