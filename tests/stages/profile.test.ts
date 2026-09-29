import { describe, expect, it } from "bun:test";
import type { PageThumbnail } from "../../src/stages/profile/interfaces/index.ts";
import { classifyPages, differenceHash, hammingDistance } from "../../src/stages/profile/page-profile.ts";

const thumbnail = (ordinal: number, pixel: (x: number, y: number) => number, dhash: bigint, size = 1000): PageThumbnail => {
  const gray = new Uint8Array(64 * 90);
  for (let y = 0; y < 90; y += 1) for (let x = 0; x < 64; x += 1) gray[y * 64 + x] = pixel(x, y);
  return { ordinal, width: size, height: 1400, gray, thumbWidth: 64, thumbHeight: 90, dhash };
};

/** Art: a diagonal gradient. Text: a dark block in the upper left that the textless variant does not have. */
const art = (x: number, y: number) => (x * 2 + y) % 200 + 30;
const withText = (x: number, y: number) => (x >= 5 && x < 20 && y >= 5 && y < 25 ? 0 : art(x, y));

describe("page profile", () => {
  it("computes a difference hash and Hamming distances", () => {
    const rising = Uint8Array.from({ length: 72 }, (_, index) => index % 9);
    expect(differenceHash(rising)).toBe(0n);
    expect(differenceHash(Uint8Array.from({ length: 72 }, (_, index) => 9 - (index % 9)))).toBe((1n << 64n) - 1n);
    expect(hammingDistance(0b1011n, 0b0001n)).toBe(2);
  });

  it("marks blank pages and pairs a textless variant with its original", () => {
    const kinds = classifyPages([
      thumbnail(1, withText, 0xf0f0n),
      thumbnail(2, () => 255, 0n),
      thumbnail(3, (x, y) => (x + y) % 256, 0x1234n),
      thumbnail(4, art, 0xf0f1n),
    ]);
    expect(kinds.get(1)).toEqual({ kind: "main" });
    expect(kinds.get(2)).toEqual({ kind: "blank" });
    expect(kinds.get(3)).toEqual({ kind: "main" });
    expect(kinds.get(4)).toEqual({ kind: "textless_variant", variantOf: 1 });
  });

  it("does not pair identical pages, different sizes or unrelated art", () => {
    const kinds = classifyPages([
      thumbnail(1, art, 0xf0n),
      thumbnail(2, art, 0xf0n),
      thumbnail(3, withText, 0xf0n, 1200),
      thumbnail(4, (x, y) => (x * y) % 256, 0xffff_ffffn),
    ]);
    expect([...kinds.values()].every((kind) => kind.kind === "main")).toBe(true);
  });
});
