import { describe, expect, it } from "bun:test";
import { deriveTextAreas, median3x3 } from "../../eval/ground-truth/textless-diff.ts";
import { changesOutsideMask, maskedMae, regionPrecision, regionRecall } from "../../eval/metrics/vision-metrics.ts";
import { erodeSquare } from "../../src/imaging/morphology.ts";

const image = (width: number, height: number, pixel: (x: number, y: number) => number) => {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.fill(pixel(x, y), (y * width + x) * 3, (y * width + x) * 3 + 3);
  return { data, width, height };
};

describe("textless ground truth", () => {
  it("removes salt noise with the median", () => {
    const noisy = image(5, 5, (x, y) => (x === 2 && y === 2 ? 255 : 10));
    expect(median3x3(noisy).data[(2 * 5 + 2) * 3]).toBe(10);
  });

  it("finds the box+text area and ignores tiny speckles", () => {
    const textless = image(100, 80, (x) => 100 + (x % 3));
    const original = image(100, 80, (x, y) => {
      if (x >= 20 && x < 60 && y >= 10 && y < 40) return x % 4 < 2 ? 0 : 250;
      if (x === 90 && y === 70) return 255;
      return 100 + (x % 3);
    });
    const { boxes, mask } = deriveTextAreas(original, textless);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.x0).toBeLessThanOrEqual(21);
    expect(boxes[0]!.x1).toBeGreaterThanOrEqual(59);
    expect(mask[70 * 100 + 90]).toBe(0);
  });

  it("rejects pages of different sizes", () => {
    expect(() => deriveTextAreas(image(10, 10, () => 0), image(10, 11, () => 0))).toThrow();
  });
});

describe("vision metrics", () => {
  const reference = [{ x0: 0, y0: 0, x1: 100, y1: 100 }, { x0: 200, y0: 0, x1: 300, y1: 100 }];

  it("measures region recall and precision by half coverage", () => {
    const predicted = [{ x0: 0, y0: 0, x1: 100, y1: 60 }, { x0: 500, y0: 500, x1: 600, y1: 600 }];
    expect(regionRecall(reference, predicted)).toBe(0.5);
    expect(regionPrecision(reference, predicted)).toBe(0.5);
    expect(regionRecall([], predicted)).toBe(1);
  });

  it("measures masked error and changes outside the mask", () => {
    const mask = Uint8Array.from([1, 0]);
    const original = Uint8Array.from([0, 0, 0, 50, 50, 50]);
    const cleaned = Uint8Array.from([30, 30, 30, 50, 50, 51]);
    expect(maskedMae(cleaned, Uint8Array.from([0, 0, 0, 0, 0, 0]), mask)).toBe(30);
    expect(changesOutsideMask(cleaned, original, mask)).toBe(1);
  });
});

describe("erodeSquare", () => {
  it("undoes a dilation of a solid block", () => {
    const mask = new Uint8Array(100);
    for (let y = 3; y < 7; y += 1) for (let x = 3; x < 7; x += 1) mask[y * 10 + x] = 1;
    const eroded = erodeSquare(mask, 10, 10, 1);
    expect(eroded.reduce((sum, value) => sum + value, 0)).toBe(4);
  });
});
