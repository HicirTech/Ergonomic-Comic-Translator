import { describe, expect, it } from "bun:test";
import type { PageThumbnail } from "../../src/stages/profile/interfaces/index.ts";
import {
  changedShare,
  classifyPages,
  isBlank,
  pairMaxChangedShare,
  pairMaxHashDistance,
  pairMinChangedShare,
} from "../../src/stages/profile/page-profile.ts";
import { clusterNearIdenticalPages } from "../../eval/ground-truth/cluster-pages.ts";

const thumbWidth = 64;
const thumbHeight = 90;

const thumbnail = (ordinal: number, pixel: (x: number, y: number) => number, dhash = 0n, size = 1000): PageThumbnail => {
  const gray = new Uint8Array(thumbWidth * thumbHeight);
  for (let y = 0; y < thumbHeight; y += 1) for (let x = 0; x < thumbWidth; x += 1) gray[y * thumbWidth + x] = pixel(x, y);
  return { ordinal, width: size, height: 1400, gray, thumbWidth, thumbHeight, dhash };
};

/** A diagonal gradient between 30 and 229. */
const art = (x: number, y: number) => (x * 2 + y) % 200 + 30;

/** The art with one dark rectangle, which is what a dialogue variant adds. It is darker than every art pixel by more than the change level. */
const withBlock = (x0: number, y0: number, x1: number, y1: number, base = art) => (x: number, y: number) =>
  x >= x0 && x < x1 && y >= y0 && y < y1 ? 0 : base(x, y);

/** A hash with exactly `bits` bits set, so its distance to hash 0 is `bits`. */
const hashWithBits = (bits: number) => (1n << BigInt(bits)) - 1n;

describe("near-identical page clusters", () => {
  it("keeps every copy of one picture together, where greedy pairing leaves one out", () => {
    const pages = [thumbnail(1, withBlock(5, 5, 20, 25)), thumbnail(2, art), thumbnail(3, withBlock(40, 50, 55, 70))];

    expect(clusterNearIdenticalPages(pages)).toEqual([[1, 2, 3]]);
    expect(classifyPages(pages).get(3)).toEqual({ kind: "main" });
  });

  it("joins two pages that differ too much to pair directly through a page both pair with", () => {
    const left = thumbnail(1, withBlock(0, 0, 30, 50));
    const bare = thumbnail(2, art);
    const right = thumbnail(3, withBlock(34, 40, 64, 90));

    expect(changedShare(left, right)).toBeGreaterThan(pairMaxChangedShare);
    expect(clusterNearIdenticalPages([left, bare, right])).toEqual([[1, 2, 3]]);
  });

  it("keeps separate pictures apart, drops single pages, and returns ascending ordinals ordered by first page", () => {
    const farHash = hashWithBits(64);
    const otherArt = (x: number, y: number) => (x * 3 + y * 2) % 190 + 40;
    const pages = [
      thumbnail(9, withBlock(5, 5, 20, 25)),
      thumbnail(5, (x, y) => (x * y) % 256, hashWithBits(32)),
      thumbnail(6, withBlock(40, 50, 55, 70, otherArt), farHash),
      thumbnail(2, art),
      thumbnail(4, otherArt, farHash),
    ];

    expect(clusterNearIdenticalPages(pages)).toEqual([[2, 9], [4, 6]]);
  });

  it("never joins blank pages, even when they meet the pair rule", () => {
    const flat = thumbnail(1, () => 128);
    const flecked = thumbnail(2, (x, y) => (x < 3 && y < 2 ? 160 : 128));

    expect(isBlank(flat) && isBlank(flecked)).toBe(true);
    expect(changedShare(flat, flecked)).toBeGreaterThanOrEqual(pairMinChangedShare);
    expect(changedShare(flat, flecked)).toBeLessThanOrEqual(pairMaxChangedShare);
    expect(clusterNearIdenticalPages([flat, flecked])).toEqual([]);
  });

  it("joins at the hash distance limit and not one bit past it", () => {
    const text = thumbnail(1, withBlock(5, 5, 20, 25));

    expect(clusterNearIdenticalPages([text, thumbnail(2, art, hashWithBits(pairMaxHashDistance))])).toEqual([[1, 2]]);
    expect(clusterNearIdenticalPages([text, thumbnail(2, art, hashWithBits(pairMaxHashDistance + 1))])).toEqual([]);
  });

  it("does not join pages of another size, identical pages, or pages that differ everywhere", () => {
    const text = thumbnail(1, withBlock(5, 5, 20, 25));

    expect(clusterNearIdenticalPages([text, thumbnail(2, art, 0n, 1200)])).toEqual([]);
    expect(clusterNearIdenticalPages([text, thumbnail(2, withBlock(5, 5, 20, 25))])).toEqual([]);
    expect(clusterNearIdenticalPages([text, thumbnail(2, (x, y) => 255 - art(x, y))])).toEqual([]);
  });

  it("returns no cluster for no page and leaves its input in order", () => {
    const pages = [thumbnail(3, art), thumbnail(1, withBlock(5, 5, 20, 25))];

    expect(clusterNearIdenticalPages([])).toEqual([]);
    expect(clusterNearIdenticalPages(pages)).toEqual([[1, 3]]);
    expect(pages.map((page) => page.ordinal)).toEqual([3, 1]);
  });
});
