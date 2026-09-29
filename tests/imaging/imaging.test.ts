import { describe, expect, it } from "bun:test";
import { rectCorners } from "../../src/geometry/rotated-rect.ts";
import { componentCornerPoints, labelComponents } from "../../src/imaging/components.ts";
import { borderMedian, cropGray, padGray, rgbToGray } from "../../src/imaging/gray.ts";
import { dilateSquare } from "../../src/imaging/morphology.ts";
import { grayToNormalizedChw, rgbToUnitChw } from "../../src/imaging/tensor.ts";
import { otsuThreshold } from "../../src/imaging/threshold.ts";
import { rotateQuarter, warpGray } from "../../src/imaging/warp.ts";

const gray = (width: number, height: number, pixel: (x: number, y: number) => number) => {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data[y * width + x] = pixel(x, y);
  return { data, width, height };
};

describe("labelComponents", () => {
  it("labels 8-connected components and records row extents", () => {
    // Two diagonal pixels (one component under 8-connectivity) and a separate bar.
    const mask = Uint8Array.from([
      1, 0, 0, 0, 0,
      0, 1, 0, 1, 1,
      0, 0, 0, 0, 0,
    ]);
    const { labels, components } = labelComponents(mask, 5, 3);
    expect(components).toHaveLength(2);
    expect(labels[0]).toBe(labels[6]);
    expect(components[1]).toMatchObject({ pixels: 2, box: { x0: 3, y0: 1, x1: 5, y1: 2 }, rows: [[1, 3, 4]] });
    expect(componentCornerPoints(components[1]!)).toHaveLength(4);
  });

  it("merges labels that meet later (U shape)", () => {
    const mask = Uint8Array.from([
      1, 0, 1,
      1, 0, 1,
      1, 1, 1,
    ]);
    expect(labelComponents(mask, 3, 3).components).toHaveLength(1);
  });
});

describe("gray helpers", () => {
  it("converts, crops, pads and finds the background tone", () => {
    const rgb = { data: Uint8Array.from([255, 0, 0, 0, 255, 0]), width: 2, height: 1 };
    expect([...rgbToGray(rgb).data]).toEqual([76, 150]);
    const image = gray(4, 4, (x, y) => (x === 0 || y === 0 || x === 3 || y === 3 ? 240 : 10));
    expect(borderMedian(image)).toBe(240);
    expect(cropGray(image, { x0: 1, y0: 1, x1: 3, y1: 3 }).data).toEqual(Uint8Array.from([10, 10, 10, 10]));
    const padded = padGray(cropGray(image, { x0: 1, y0: 1, x1: 3, y1: 3 }), 1, 200, 4, 4);
    expect(padded.data[0]).toBe(200);
    expect(padded.data[5]).toBe(10);
    expect(() => cropGray(image, { x0: 2, y0: 2, x1: 5, y1: 3 })).toThrow();
  });

  it("finds an Otsu threshold between two tones", () => {
    const threshold = otsuThreshold(gray(10, 10, (x) => (x < 5 ? 20 : 220)));
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(220);
  });

  it("dilates with a square", () => {
    const mask = new Uint8Array(25);
    mask[12] = 1;
    const grown = dilateSquare(mask, 5, 5, 1);
    expect(grown.reduce((sum, value) => sum + value, 0)).toBe(9);
    expect(grown[0]).toBe(0);
  });
});

describe("tensors", () => {
  it("builds planar inputs", () => {
    const unit = rgbToUnitChw({ data: Uint8Array.from([255, 0, 51]), width: 1, height: 1 });
    expect([...unit]).toEqual([1, 0, 0.2].map((value) => Math.fround(value)));
    const normalized = grayToNormalizedChw({ data: Uint8Array.from([255]), width: 1, height: 1 }, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    expect([...normalized]).toEqual([1, 1, 1]);
  });
});

describe("warp and rotate", () => {
  it("rectifies a tilted rectangle back to upright", () => {
    // A dark 40x10 bar tilted by 30 degrees on a white page.
    const rect = { center: { x: 50, y: 50 }, long: 40, short: 10, angle: 30 };
    const radians = (30 * Math.PI) / 180;
    const page = gray(100, 100, (x, y) => {
      const dx = x + 0.5 - 50;
      const dy = y + 0.5 - 50;
      const along = dx * Math.cos(radians) + dy * Math.sin(radians);
      const across = -dx * Math.sin(radians) + dy * Math.cos(radians);
      return Math.abs(along) <= 20 && Math.abs(across) <= 5 ? 0 : 255;
    });
    const upright = warpGray(page, rectCorners(rect), 40, 10);
    const inner = [...cropGray(upright, { x0: 2, y0: 2, x1: 38, y1: 8 }).data];
    expect(Math.max(...inner)).toBeLessThan(40);
  });

  it("rotates by quarter turns clockwise", () => {
    const image = { data: Uint8Array.from([1, 2, 3, 4, 5, 6]), width: 3, height: 2 };
    expect(rotateQuarter(image, 1, 1)).toEqual({ data: Uint8Array.from([4, 1, 5, 2, 6, 3]), width: 2, height: 3 });
    expect(rotateQuarter(image, 2, 1).data).toEqual(Uint8Array.from([6, 5, 4, 3, 2, 1]));
    expect(rotateQuarter(rotateQuarter(image, 1, 1), 3, 1)).toEqual(image);
  });
});
