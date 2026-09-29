import { describe, expect, it } from "bun:test";
import { lineAngleDistance, lineFamily, meanTilt, normalizeLineAngle } from "../../src/geometry/angle.ts";
import { coverage, iou, unionBox } from "../../src/geometry/box.ts";
import { convexHull, minAreaRect, rectCorners, rotatePoint, unclipRect } from "../../src/geometry/rotated-rect.ts";

describe("angles", () => {
  it("normalise line directions to (-90, 90]", () => {
    expect([0, 90, -90, 180, 135, -135, 270].map(normalizeLineAngle)).toEqual([0, 90, 90, 0, -45, 45, 90]);
  });

  it("split long-axis angles into writing family and tilt", () => {
    expect(lineFamily(10)).toEqual({ family: "h", tilt: 10 });
    expect(lineFamily(-45)).toEqual({ family: "h", tilt: -45 });
    expect(lineFamily(80)).toEqual({ family: "v", tilt: -10 });
    expect(lineFamily(-80)).toEqual({ family: "v", tilt: 10 });
  });

  it("average tilts on the doubled circle", () => {
    const opposite = meanTilt([{ tilt: 89, weight: 1 }, { tilt: -89, weight: 1 }]);
    expect(Math.abs(opposite.tilt)).toBeCloseTo(90, 6);
    expect(opposite.consistency).toBeCloseTo(Math.cos((2 * Math.PI) / 180), 6);
    const weighted = meanTilt([{ tilt: 10, weight: 3 }, { tilt: 20, weight: 1 }]);
    expect(weighted.tilt).toBeGreaterThan(10);
    expect(weighted.tilt).toBeLessThan(15);
    expect(meanTilt([])).toEqual({ tilt: 0, consistency: 0 });
  });

  it("measure distances between line angles", () => {
    expect(lineAngleDistance(89, -89)).toBeCloseTo(2, 9);
    expect(lineAngleDistance(0, 90)).toBe(90);
  });
});

describe("boxes", () => {
  const a = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const b = { x0: 5, y0: 0, x1: 15, y1: 10 };
  it("computes IoU, coverage and unions", () => {
    expect(iou(a, b)).toBeCloseTo(50 / 150, 9);
    expect(coverage({ x0: 2, y0: 2, x1: 4, y1: 4 }, a)).toBe(1);
    expect(unionBox([a, b])).toEqual({ x0: 0, y0: 0, x1: 15, y1: 10 });
  });
});

describe("rotated rectangles", () => {
  const rotated = (angle: number, long: number, short: number) => {
    const rect = { center: { x: 50, y: 40 }, long, short, angle };
    return rectCorners(rect);
  };

  it("builds a hull without interior points", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }]);
    expect(hull).toHaveLength(4);
  });

  it("recovers angle and sides of rotated rectangles", () => {
    for (const angle of [0, 12.5, 30, -30, 45, 60, -75, 90]) {
      const rect = minAreaRect(rotated(angle, 80, 20))!;
      expect(lineAngleDistance(rect.angle, angle)).toBeLessThan(1e-6);
      expect(rect.long).toBeCloseTo(80, 6);
      expect(rect.short).toBeCloseTo(20, 6);
      expect(rect.center.x).toBeCloseTo(50, 6);
      expect(rect.center.y).toBeCloseTo(40, 6);
    }
  });

  it("returns null for collinear points", () => {
    expect(minAreaRect([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
  });

  it("unclips by area * ratio / perimeter on every side", () => {
    const grown = unclipRect({ center: { x: 0, y: 0 }, long: 100, short: 10, angle: 0 }, 1.5);
    const distance = (100 * 10 * 1.5) / 220;
    expect(grown.long).toBeCloseTo(100 + 2 * distance, 9);
    expect(grown.short).toBeCloseTo(10 + 2 * distance, 9);
  });

  it("rotates points clockwise on screen for positive angles", () => {
    const point = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(point.x).toBeCloseTo(0, 9);
    expect(point.y).toBeCloseTo(1, 9);
  });
});
