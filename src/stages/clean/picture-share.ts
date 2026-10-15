import type { GrayImage } from "../../imaging/interfaces/index.ts";
import { dilateSquare } from "../../imaging/morphology.ts";
import type { PictureShare } from "./interfaces/index.ts";
import { rimAwayPixels, solveMembrane } from "./membrane-solve.ts";

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
 * a balloon's outline at one end is plain paper everywhere else, where the model is less exact than the
 * membrane.
 */
export const pictureShare = (gray: GrayImage, mask: Uint8Array): PictureShare => {
  const { width, height } = gray;
  const tones = new Float32Array(mask.length * 2);
  for (let index = 0; index < mask.length; index += 1) {
    const tone = gray.data[index]! - midTone;
    tones[index * 2] = tone;
    tones[index * 2 + 1] = (tone * tone) / midTone;
  }
  const { holes, value } = solveMembrane(tones, 2, dilateSquare(mask, width, height, rimAwayPixels), width, height, settledBelow, maxSweeps);
  const share = new Float32Array(mask.length);
  const rimTone = new Float32Array(mask.length);
  const rimSpread = new Float32Array(mask.length);
  holes.forEach((index, hole) => {
    if (!mask[index]) return;
    const mean = value[hole * 2]!;
    const spread = Math.sqrt(Math.max(0, value[hole * 2 + 1]! * midTone - mean * mean));
    share[index] = Math.max(0, Math.min(1, (spread - plainSpread) / (picturedSpread - plainSpread)));
    rimTone[index] = mean + midTone;
    rimSpread[index] = spread;
  });
  return { share, rimTone, rimSpread };
};

/**
 * The lightest tone a rim commonly holds is this many spreads above its mean: one spread cut the model's
 * light paper beside dark lines (transplant lab, book 2: structure error 17 to 27), two leave it (17 to 19).
 */
const rimSpreadAllowance = 2;

/**
 * How far a model's fill of a pixel is trusted against the rim it was drawn from: fully as long as it is
 * no lighter than the rim's tones allow (their mean, two spreads and the grain of plain paper), fading to
 * nothing over one more grain. A model trained on white pages paints a wide hole on dark artwork as a
 * light block, a paper it invents; the lines it continues through the hole are darker than the rim's mean
 * and keep its fill.
 */
export const modelFillTrust = (luma: number, rimTone: number, rimSpread: number) =>
  Math.max(0, Math.min(1, 1 - (luma - rimTone - rimSpreadAllowance * rimSpread - plainSpread) / plainSpread));
