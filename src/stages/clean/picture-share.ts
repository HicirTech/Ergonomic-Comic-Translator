import { labelComponents } from "../../imaging/components.ts";
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
 * The rim's tones are counted against the mean of their own rim within this radius: the shading of a sky
 * or a wall along a wide hole is a change the membrane follows exactly, and only what is left after it, an
 * edge, a line or screentone, needs the model. Across a stroke thinner than the window both sides lie in
 * it, so a difference between them still counts; the rims of neighbouring strokes and anything beyond the
 * rim do not, as the membrane sees neither.
 */
const trendRadiusPixels = 32;
/**
 * The lightest tone a rim commonly holds is this many spreads above its mean: one spread cut the model's
 * light paper beside dark lines (transplant lab, book 2: structure error 17 to 27), two leave it (17 to 19).
 */
const rimSpreadAllowance = 2;

/**
 * The mean tone of each ring pixel's own ring within `radius` of it: the ring around one hole, not the
 * rings of its neighbours, which may run along other things. Zero off the rings.
 */
const ringMean = (gray: GrayImage, ring: Uint8Array, radius: number) => {
  const { width, data } = gray;
  const { labels, components } = labelComponents(ring, width, gray.height);
  const mean = new Float32Array(width * gray.height);
  components.forEach((component, slot) => {
    const label = slot + 1;
    const { x0, y0, x1, y1 } = component.box;
    const boxWidth = x1 - x0;
    const boxHeight = y1 - y0;
    const stride = boxWidth + 1;
    const sums = new Float64Array(stride * (boxHeight + 1));
    const counts = new Float64Array(stride * (boxHeight + 1));
    for (let y = 0; y < boxHeight; y += 1) {
      let rowSum = 0;
      let rowCount = 0;
      for (let x = 0; x < boxWidth; x += 1) {
        const index = (y0 + y) * width + x0 + x;
        if (labels[index] === label) {
          rowSum += data[index]!;
          rowCount += 1;
        }
        sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + rowSum;
        counts[(y + 1) * stride + x + 1] = counts[y * stride + x + 1]! + rowCount;
      }
    }
    for (let y = 0; y < boxHeight; y += 1) {
      const top = Math.max(0, y - radius);
      const bottom = Math.min(boxHeight, y + radius + 1);
      for (let x = 0; x < boxWidth; x += 1) {
        const index = (y0 + y) * width + x0 + x;
        if (labels[index] !== label) continue;
        const left = Math.max(0, x - radius);
        const right = Math.min(boxWidth, x + radius + 1);
        const total = sums[bottom * stride + right]! - sums[top * stride + right]! - sums[bottom * stride + left]! + sums[top * stride + left]!;
        const pixels = counts[bottom * stride + right]! - counts[top * stride + right]! - counts[bottom * stride + left]! + counts[top * stride + left]!;
        mean[index] = total / pixels;
      }
    }
  });
  return mean;
};

/**
 * How much of the picture shows around each masked pixel: 0 where the paper around the text is plain, 1
 * where a line, the edge of a shape or screentone meets the strokes, in between on the ramp from
 * `plainSpread` to `picturedSpread`. Zero outside the mask.
 *
 * The membrane fill gives a pixel an average of the rim's tones, weighted by how near each part of the rim
 * is. On plain paper those tones agree and the fill is exact. Where they differ the fill is a blend of
 * them, a smear, and how much they differ is the spread of that average: the root of the average of the
 * squared tones minus the squared average, which two membrane solves give for every pixel at once. The
 * tones are counted against the rim's mean around them, so a shading that the membrane follows does not
 * count as a difference. Only where they differ does the page need a model's fill, and only that part of a
 * hole: a column of glyphs that touches a balloon's outline at one end is plain paper everywhere else,
 * where the model is less exact than the membrane. The rim's mean tone and spread come along, for the
 * model's fill to be judged against.
 */
export const pictureShare = (gray: GrayImage, mask: Uint8Array): PictureShare => {
  const { width, height } = gray;
  const rim = dilateSquare(mask, width, height, rimAwayPixels);
  const beyondRim = dilateSquare(mask, width, height, rimAwayPixels + 1);
  const ring = rim.map((value, index) => (beyondRim[index]! && !value ? 1 : 0));
  const trend = ringMean(gray, ring, trendRadiusPixels);
  const tones = new Float32Array(mask.length * 3);
  for (let index = 0; index < mask.length; index += 1) {
    const left = ring[index] ? gray.data[index]! - trend[index]! : 0;
    tones[index * 3] = gray.data[index]! - midTone;
    tones[index * 3 + 1] = left;
    tones[index * 3 + 2] = (left * left) / midTone;
  }
  const { holes, value } = solveMembrane(tones, 3, rim, width, height, settledBelow, maxSweeps);
  const share = new Float32Array(mask.length);
  const rimTone = new Float32Array(mask.length);
  const rimSpread = new Float32Array(mask.length);
  holes.forEach((index, hole) => {
    if (!mask[index]) return;
    const mean = value[hole * 3 + 1]!;
    const spread = Math.sqrt(Math.max(0, value[hole * 3 + 2]! * midTone - mean * mean));
    share[index] = Math.max(0, Math.min(1, (spread - plainSpread) / (picturedSpread - plainSpread)));
    rimTone[index] = value[hole * 3]! + midTone;
    rimSpread[index] = spread;
  });
  return { share, rimTone, rimSpread };
};

/**
 * How far a model's fill of a pixel is trusted against the rim it was drawn from: fully as long as it is
 * no lighter than the rim's tones allow (their mean, two spreads and the grain of plain paper), fading to
 * nothing over one more grain. A model trained on white pages paints a wide hole on dark artwork as a
 * light block, a paper it invents; the lines it continues through the hole are darker than the rim's mean
 * and keep its fill.
 */
export const modelFillTrust = (luma: number, rimTone: number, rimSpread: number) =>
  Math.max(0, Math.min(1, 1 - (luma - rimTone - rimSpreadAllowance * rimSpread - plainSpread) / plainSpread));
