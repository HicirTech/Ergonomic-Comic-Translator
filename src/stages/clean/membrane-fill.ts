import type { RgbImage } from "../../imaging/interfaces/index.ts";
import { solveMembrane } from "./membrane-solve.ts";

/** Relaxation stops when no hole pixel moves by more than this (in 8-bit levels), or after maxSweeps. */
const settledBelow = 0.25;
const maxSweeps = 400;

/**
 * Fills the masked pixels in place so that each is the average of its four neighbours (a membrane stretched
 * over the hole, with the unmasked pixels around it as its rim). On paper that changes smoothly under the
 * text this restores the paper exactly, without the tint and noise of a generative model; it cannot
 * continue an edge or a pattern and smears them instead, so where the picture meets the text the model's
 * fill takes its place (see pictureShare). Nothing outside the mask changes.
 */
export const membraneFill = (rgb: RgbImage, mask: Uint8Array) => {
  const { holes, value } = solveMembrane(rgb.data, 3, mask, rgb.width, rgb.height, settledBelow, maxSweeps);
  holes.forEach((index, hole) => {
    for (let channel = 0; channel < 3; channel += 1) {
      rgb.data[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(value[hole * 3 + channel]!)));
    }
  });
};
