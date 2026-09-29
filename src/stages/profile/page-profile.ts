import type { PageKind, PageThumbnail } from "./interfaces/index.ts";

/** A page this uniform (luma standard deviation) carries no text. */
const blankMaxStd = 3;
/** dHash bits that may differ between a page and its textless variant (text is a small part of a page). */
const pairMaxHashDistance = 10;
/** Thumbnail pixels that differ by more than this count as changed. */
const pixelChangeLevel = 24;
/** A textless variant changes some, but not most, of the page. */
const pairMinChangedShare = 0.001;
const pairMaxChangedShare = 0.3;

/**
 * 64-bit difference hash: shrink to 9 x 8, compare each pixel with its right neighbour.
 * `gray9x8` must hold 72 pixels.
 */
export const differenceHash = (gray9x8: Uint8Array) => {
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash = (hash << 1n) | (gray9x8[y * 9 + x]! > gray9x8[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return hash;
};

export const hammingDistance = (a: bigint, b: bigint) => {
  let value = a ^ b;
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
};

export const isBlank = (thumbnail: PageThumbnail) => {
  const pixels = thumbnail.gray;
  let mean = 0;
  for (const value of pixels) mean += value;
  mean /= pixels.length;
  let variance = 0;
  for (const value of pixels) variance += (value - mean) ** 2;
  return Math.sqrt(variance / pixels.length) <= blankMaxStd;
};

const changedShare = (a: PageThumbnail, b: PageThumbnail) => {
  let changed = 0;
  for (let index = 0; index < a.gray.length; index += 1) {
    if (Math.abs(a.gray[index]! - b.gray[index]!) > pixelChangeLevel) changed += 1;
  }
  return changed / a.gray.length;
};

/**
 * S1: blank pages and textless variants. Two pages pair when they have the same size, near-identical
 * dHashes and a small but non-zero share of changed pixels; the later page of a pair is the variant
 * (CG sets append their textless pages). Each page pairs at most once.
 */
export const classifyPages = (thumbnails: readonly PageThumbnail[]): Map<number, PageKind> => {
  const kinds = new Map<number, PageKind>();
  for (const thumbnail of thumbnails) {
    kinds.set(thumbnail.ordinal, isBlank(thumbnail) ? { kind: "blank" } : { kind: "main" });
  }
  const paired = new Set<number>();
  const ordered = [...thumbnails].sort((a, b) => a.ordinal - b.ordinal);
  for (const later of ordered) {
    if (kinds.get(later.ordinal)!.kind !== "main") continue;
    const original = ordered.find((earlier) =>
      earlier.ordinal < later.ordinal
      && !paired.has(earlier.ordinal)
      && kinds.get(earlier.ordinal)!.kind === "main"
      && earlier.width === later.width
      && earlier.height === later.height
      && hammingDistance(earlier.dhash, later.dhash) <= pairMaxHashDistance
      && (() => {
        const share = changedShare(earlier, later);
        return share >= pairMinChangedShare && share <= pairMaxChangedShare;
      })());
    if (original) {
      paired.add(original.ordinal);
      paired.add(later.ordinal);
      kinds.set(later.ordinal, { kind: "textless_variant", variantOf: original.ordinal });
    }
  }
  return kinds;
};
