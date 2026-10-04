import type { GrayImage } from "../../imaging/interfaces/index.ts";
import { dilateSquare } from "../../imaging/morphology.ts";
import { solveMembrane } from "./membrane-solve.ts";

/** The rim is read this far outside the mask: nearer pixels still carry a trace of the ink. */
const rimAwayPixels = 2;
/** Tones are counted from mid-grey, and their squares in units of it, so both stay within 128. */
const midTone = 128;
/** With this stopping rule the spread is exact to a tenth of a level on text of ordinary size. */
const settledBelow = 0.02;
const maxSweeps = 1500;
/** Up to this spread of the rim's tones the paper is plain: grain of 12 levels either way spreads them by 7. */
const plainSpread = 8;
/** From this spread on the picture runs under the text. */
const picturedSpread = 16;

/**
 * How much of the picture shows around each masked pixel: 0 where the paper around the text is plain, 1
 * where a line, the edge of a shape or screentone meets the strokes, in between on the ramp from
 * `plainSpread` to `picturedSpread`. Zero outside the mask.
 *
 * The membrane fill gives a pixel an average of the rim's tones, weighted by how near each part of the rim
 * is. On plain paper those tones agree and the fill is exact. Where they differ the fill is a blend of
 * them, a smear, and how much they differ is the spread of that average: the root of the average of the
 * squared tones minus the squared average, which two membrane solves give for every pixel at once. Only
 * there does the page need a model's fill, and only that part of a hole: a column of glyphs that touches
 * a balloon's outline at one end is plain paper everywhere else.
 *
 * Measured on two volumes by erasing stroke-shaped holes where the true pixels are known, with the model's
 * fill blended in by this share: mean error 2.1 and 0.4 levels, on the picture's edges 16 and 22. The
 * membrane alone leaves 2.6 and 0.6, on edges 29 and 51 (it smears them); the model alone 4.5 and 3.5 (it
 * tints plain paper).
 */
export const pictureShare = (gray: GrayImage, mask: Uint8Array) => {
  const { width, height } = gray;
  const tones = new Float32Array(mask.length * 2);
  for (let index = 0; index < mask.length; index += 1) {
    const tone = gray.data[index]! - midTone;
    tones[index * 2] = tone;
    tones[index * 2 + 1] = (tone * tone) / midTone;
  }
  const { holes, value } = solveMembrane(tones, 2, dilateSquare(mask, width, height, rimAwayPixels), width, height, settledBelow, maxSweeps);
  const share = new Float32Array(mask.length);
  holes.forEach((index, hole) => {
    if (!mask[index]) return;
    const mean = value[hole * 2]!;
    const spread = Math.sqrt(Math.max(0, value[hole * 2 + 1]! * midTone - mean * mean));
    share[index] = Math.max(0, Math.min(1, (spread - plainSpread) / (picturedSpread - plainSpread)));
  });
  return share;
};
