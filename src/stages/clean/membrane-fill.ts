import type { RgbImage } from "../../imaging/interfaces/index.ts";
import type { RegionMask } from "../mask/interfaces/index.ts";

/**
 * Paper without fine texture in the ring around the text goes to the membrane fill; with more (screentone,
 * hatching) the inpainting model has to continue the pattern. Measured ring detail: at most 7.5 on the
 * dialogue regions of two CG-style volumes (gradients, artwork behind translucent boxes), 19 and above on
 * halftone dots, hatching and fine noise. On the smooth kinds the membrane fill is closer to the true paper
 * than the model (3.2 against 7.1 luma on real dialogue boxes, 0.2 against 2.5 on a gradient); on halftone
 * dots the model is closer (44 against 58).
 */
export const membraneFillMaxRingDetail = 10;

export const canMembraneFill = (region: RegionMask) => region.ringDetail <= membraneFillMaxRingDetail;

/** Relaxation stops when no hole pixel moves by more than this (in 8-bit levels), or after maxSweeps. */
const settledBelow = 0.25;
const maxSweeps = 400;
/** Successive over-relaxation factor; 1 is plain Gauss-Seidel. */
const overRelaxation = 1.6;

const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Fills the masked pixels in place so that each is the average of its four neighbours (a membrane stretched
 * over the hole, with the unmasked pixels around it as its rim). On paper that changes smoothly under the
 * text, such as a gradient or artwork seen through a translucent box, this restores the paper without the
 * patches a generative model leaves; it cannot continue a fine pattern such as screentone. Nothing outside
 * the mask changes.
 */
export const membraneFill = (rgb: RgbImage, mask: Uint8Array) => {
  const { width, height } = rgb;
  const holes: number[] = [];
  const slot = new Int32Array(mask.length).fill(-1);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    slot[index] = holes.length;
    holes.push(index);
  }
  if (holes.length === 0) return;

  // Per hole: its hole neighbours, and the sum and count of its fixed neighbours.
  const links = new Int32Array(holes.length * 4).fill(-1);
  const fixedSum = new Float32Array(holes.length * 3);
  const count = new Uint8Array(holes.length);
  holes.forEach((index, hole) => {
    const x = index % width;
    const y = Math.floor(index / width);
    neighbours.forEach(([dx, dy], side) => {
      const sx = x + dx;
      const sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;
      const other = sy * width + sx;
      count[hole]! += 1;
      if (slot[other]! >= 0) {
        links[hole * 4 + side] = slot[other]!;
      } else {
        for (let channel = 0; channel < 3; channel += 1) fixedSum[hole * 3 + channel]! += rgb.data[other * 3 + channel]!;
      }
    });
  });

  // Seed layer by layer from the rim, so the relaxation starts close to its answer.
  const value = new Float32Array(holes.length * 3);
  const seeded = new Uint8Array(holes.length);
  let layer = holes.map((_, hole) => hole);
  while (layer.length > 0) {
    const next: number[] = [];
    const ready: number[] = [];
    for (const hole of layer) {
      let known = 0;
      const sum = [fixedSum[hole * 3]!, fixedSum[hole * 3 + 1]!, fixedSum[hole * 3 + 2]!];
      let fixed = count[hole]!;
      for (let side = 0; side < 4; side += 1) {
        const other = links[hole * 4 + side]!;
        if (other < 0) continue;
        fixed -= 1;
        if (!seeded[other]) continue;
        known += 1;
        for (let channel = 0; channel < 3; channel += 1) sum[channel]! += value[other * 3 + channel]!;
      }
      if (fixed + known === 0) {
        next.push(hole);
        continue;
      }
      for (let channel = 0; channel < 3; channel += 1) value[hole * 3 + channel] = sum[channel]! / (fixed + known);
      ready.push(hole);
    }
    if (ready.length === 0) break;
    for (const hole of ready) seeded[hole] = 1;
    layer = next;
  }

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let moved = 0;
    for (let hole = 0; hole < holes.length; hole += 1) {
      if (count[hole] === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = fixedSum[hole * 3 + channel]!;
        for (let side = 0; side < 4; side += 1) {
          const other = links[hole * 4 + side]!;
          if (other >= 0) sum += value[other * 3 + channel]!;
        }
        const offset = hole * 3 + channel;
        const step = overRelaxation * (sum / count[hole]! - value[offset]!);
        value[offset] = value[offset]! + step;
        moved = Math.max(moved, Math.abs(step));
      }
    }
    if (moved < settledBelow) break;
  }

  holes.forEach((index, hole) => {
    for (let channel = 0; channel < 3; channel += 1) {
      rgb.data[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(value[hole * 3 + channel]!)));
    }
  });
};
