import { labelComponents } from "../../imaging/components.ts";
import { dilateSquare } from "../../imaging/morphology.ts";

/**
 * The boundary of a band drawn around the glyphs lies at least this far outside the strokes' growth. A
 * lighter patch of the picture that the strokes touch has boundary pixels right at them: measured on one
 * volume, every one of its light patches did, no outline band does.
 */
const bandMinDistance = 2;
/**
 * The boundary keeps its distance from the strokes within this spread: an outline is a glyph's own shape
 * drawn wider, a lighter rectangle or a bubble around a text block is not.
 */
const bandMaxSpread = 3;
/** Distances are measured this far out; a band's boundary lies well within it. */
const maxDistance = 16;
/**
 * A band surrounds the glyphs: at least this share of the pixels next to the strokes' growth are its
 * colour. A lighter patch the text stands against on one side covers half of them.
 */
const bandMinCoverage = 0.8;

const percentile = (sorted: readonly number[], share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

/** The pixels of `mask` with a side on a pixel of `other` (4-neighbourhood). */
const nextTo = (mask: Uint8Array, other: Uint8Array, width: number, height: number) => {
  const found: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if ((x > 0 && other[index - 1]) || (x < width - 1 && other[index + 1]) || (y > 0 && other[index - width]) || (y < height - 1 && other[index + width])) found.push(index);
  }
  return found;
};

/** The pixels of `mask` whose piece reaches the edge of `within`: a side on a pixel outside it, or the image border. */
const reachingOut = (mask: Uint8Array, within: Uint8Array, width: number, height: number) => {
  const { labels, components } = labelComponents(mask, width, height);
  const reaches = new Uint8Array(components.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || !within[index - 1] || !within[index + 1] || !within[index - width] || !within[index + width]) reaches[labels[index]! - 1] = 1;
  }
  return mask.map((value, index) => (value && reaches[labels[index]! - 1] ? 1 : 0));
};

/**
 * Whether `zone`, the pixels of one colour reached from `seed` inside `within`, is a band that hugs the
 * strokes of `seed`: it surrounds them, and the pixels on its boundary with the outside lie at one distance
 * from `seed`. The outside is the rest of `within` that reaches its edge: specks the flood left at the
 * glyphs' blended edges, enclosed by the band, are no boundary. Distances are the number of one-pixel
 * dilations of `seed` it takes to cover a pixel.
 */
export const bandHugsStrokes = (zone: Uint8Array, seed: Uint8Array, within: Uint8Array, width: number, height: number) => {
  const beside = nextTo(within.map((value, index) => value & (seed[index]! ^ 1)), seed, width, height);
  if (beside.length === 0 || beside.filter((index) => zone[index]).length < bandMinCoverage * beside.length) return false;
  const rest = within.map((value, index) => value & (zone[index]! ^ 1) & (seed[index]! ^ 1));
  const boundary = nextTo(zone, reachingOut(rest, within, width, height), width, height);
  if (boundary.length === 0) return false;
  const distances: number[] = [];
  const unreached = new Set(boundary);
  let grown = seed;
  for (let distance = 1; distance <= maxDistance && unreached.size > 0; distance += 1) {
    grown = dilateSquare(grown, width, height, 1);
    for (const index of [...unreached]) {
      if (!grown[index]) continue;
      distances.push(distance);
      unreached.delete(index);
    }
  }
  for (let left = 0; left < unreached.size; left += 1) distances.push(maxDistance + 1);
  distances.sort((a, b) => a - b);
  const near = percentile(distances, 0.1);
  const far = percentile(distances, 0.9);
  return near >= bandMinDistance && far - near <= bandMaxSpread;
};
