/** Successive over-relaxation factor; 1 is plain Gauss-Seidel. */
const overRelaxation = 1.6;

const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Stretches a membrane over the masked pixels: each gets the average of its four neighbours, with the
 * unmasked pixels around the mask as its fixed rim. `source` holds `channels` values per pixel. Relaxation
 * stops when no value moves by more than `settledBelow`, or after `maxSweeps`. Returns the masked pixels
 * and their values, `channels` per pixel in the order of `holes`.
 */
export const solveMembrane = (
  source: ArrayLike<number>,
  channels: number,
  mask: Uint8Array,
  width: number,
  height: number,
  settledBelow: number,
  maxSweeps: number,
) => {
  const holes: number[] = [];
  const slot = new Int32Array(mask.length).fill(-1);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    slot[index] = holes.length;
    holes.push(index);
  }

  // Per hole: its hole neighbours, and the sum and count of its fixed neighbours.
  const links = new Int32Array(holes.length * 4).fill(-1);
  const fixedSum = new Float64Array(holes.length * channels);
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
        for (let channel = 0; channel < channels; channel += 1) fixedSum[hole * channels + channel]! += source[other * channels + channel]!;
      }
    });
  });

  // Seed layer by layer from the rim, so the relaxation starts close to its answer.
  const value = new Float64Array(holes.length * channels);
  const seeded = new Uint8Array(holes.length);
  const sum = new Float64Array(channels);
  let layer = holes.map((_, hole) => hole);
  while (layer.length > 0) {
    const next: number[] = [];
    const ready: number[] = [];
    for (const hole of layer) {
      let known = 0;
      let fixed = count[hole]!;
      for (let channel = 0; channel < channels; channel += 1) sum[channel] = fixedSum[hole * channels + channel]!;
      for (let side = 0; side < 4; side += 1) {
        const other = links[hole * 4 + side]!;
        if (other < 0) continue;
        fixed -= 1;
        if (!seeded[other]) continue;
        known += 1;
        for (let channel = 0; channel < channels; channel += 1) sum[channel]! += value[other * channels + channel]!;
      }
      if (fixed + known === 0) {
        next.push(hole);
        continue;
      }
      for (let channel = 0; channel < channels; channel += 1) value[hole * channels + channel] = sum[channel]! / (fixed + known);
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
      for (let channel = 0; channel < channels; channel += 1) {
        let around = fixedSum[hole * channels + channel]!;
        for (let side = 0; side < 4; side += 1) {
          const other = links[hole * 4 + side]!;
          if (other >= 0) around += value[other * channels + channel]!;
        }
        const offset = hole * channels + channel;
        const step = overRelaxation * (around / count[hole]! - value[offset]!);
        value[offset] = value[offset]! + step;
        moved = Math.max(moved, Math.abs(step));
      }
    }
    if (moved < settledBelow) break;
  }
  return { holes, value };
};
