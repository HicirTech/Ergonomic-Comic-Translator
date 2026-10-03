import type { PageThumbnail } from "../../src/stages/profile/interfaces/index.ts";
import {
  changedShare,
  hammingDistance,
  isBlank,
  pairMaxChangedShare,
  pairMaxHashDistance,
  pairMinChangedShare,
} from "../../src/stages/profile/page-profile.ts";

/** The pair test of classifyPages, without its order rule and its one-partner limit. */
const areNearIdentical = (a: PageThumbnail, b: PageThumbnail) => {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (hammingDistance(a.dhash, b.dhash) > pairMaxHashDistance) return false;
  const share = changedShare(a, b);
  return share >= pairMinChangedShare && share <= pairMaxChangedShare;
};

const rootOf = (parent: readonly number[], index: number) => {
  let root = index;
  while (parent[root] !== root) root = parent[root]!;
  return root;
};

/**
 * Groups of two or more near-identical pages: one picture, its dialogue variants and its textless copy.
 * classifyPages pairs each page at most once, so a picture with three or more copies is split and which
 * pages pair depends on page order. Here every matching pair is joined and a group is a connected set
 * (union-find). Blank pages never join. Returns ordinals: each group ascending, groups ordered by first page.
 */
export const clusterNearIdenticalPages = (thumbnails: readonly PageThumbnail[]): number[][] => {
  const pages = thumbnails.filter((thumbnail) => !isBlank(thumbnail)).sort((a, b) => a.ordinal - b.ordinal);
  const parent = pages.map((_page, index) => index);
  for (let left = 0; left < pages.length; left += 1) {
    for (let right = left + 1; right < pages.length; right += 1) {
      if (areNearIdentical(pages[left]!, pages[right]!)) parent[rootOf(parent, right)] = rootOf(parent, left);
    }
  }
  const clusters = new Map<number, number[]>();
  pages.forEach((page, index) => {
    const root = rootOf(parent, index);
    clusters.set(root, [...(clusters.get(root) ?? []), page.ordinal]);
  });
  return [...clusters.values()].filter((cluster) => cluster.length >= 2);
};
