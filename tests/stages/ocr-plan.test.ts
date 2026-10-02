import { describe, expect, it } from "bun:test";
import { canProbeUpsideDown, chooseReading, isUpsideDown, planQuarterTurns, preferAxisAligned, preferFlippedReading, utteranceCrop } from "../../src/stages/ocr/ocr-plan.ts";

const reading = (quarterTurns: number, meanProb: number) => ({ quarterTurns, meanProb, minProb: meanProb, tokens: 5, text: `r${quarterTurns}` });
const orientation = (tilt: number, ambiguous = false) => ({
  tilt,
  consistency: 1,
  writingMode: "v" as const,
  ambiguous,
  frame: { cx: 0, cy: 0, w: 10, h: 10, angle: tilt },
});

describe("utteranceCrop", () => {
  it("adds context around an axis-aligned utterance", () => {
    const crop = utteranceCrop({ cx: 50, cy: 50, w: 40, h: 100, angle: 0 }, { x0: 30, y0: 0, x1: 70, y1: 100 }, [0]);
    expect(crop.corners[0]).toEqual({ x: 22, y: -8 });
    expect([crop.width, crop.height]).toEqual([56, 116]);
  });

  it("turns the upright box back by the frame angle for slanted text", () => {
    const crop = utteranceCrop({ cx: 0, cy: 0, w: 100, h: 20, angle: 30 }, { x0: -50, y0: -10, x1: 50, y1: 10 }, [0]);
    const [a, b] = crop.corners;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    expect(angle).toBeCloseTo(30, 6);
  });
});

describe("planQuarterTurns", () => {
  it("searches the sideways orientations only when geometry is unsure", () => {
    expect(planQuarterTurns(orientation(3), true)).toEqual([0]);
    expect(planQuarterTurns(orientation(30), true)).toEqual([0, 1, 3]);
    expect(planQuarterTurns(orientation(0, true), true)).toEqual([0, 1, 3]);
    expect(planQuarterTurns(orientation(0), false)).toEqual([0, 1, 3]);
  });
});

describe("chooseReading", () => {
  it("takes the clear winner", () => {
    expect(chooseReading([reading(0, 0.6), reading(1, 0.95), reading(3, 0.4)], 0)).toEqual({ reading: reading(1, 0.95), unsure: false });
  });

  it("uses the prior orientation when the top two are within 0.05, and marks the result unsure", () => {
    expect(chooseReading([reading(0, 0.9), reading(1, 0.92)], 0)).toEqual({ reading: reading(0, 0.9), unsure: true });
  });

  it("returns null without candidates", () => {
    expect(chooseReading([], 0)).toBeNull();
  });
});

describe("orientation fallbacks", () => {
  it("flips only above 0.5 and falls back to the plain crop only when clearly better", () => {
    expect(isUpsideDown(0.51)).toBe(true);
    expect(isUpsideDown(0.5)).toBe(false);
    expect(preferAxisAligned(reading(0, 0.6), reading(0, 0.8))).toBe(true);
    expect(preferAxisAligned(reading(0, 0.7), reading(0, 0.8))).toBe(false);
  });

  it("probes textline-ori only for a single horizontal line", () => {
    expect(canProbeUpsideDown("h", 1)).toBe(true);
    expect(canProbeUpsideDown("v", 1)).toBe(false);
    expect(canProbeUpsideDown("h", 2)).toBe(false);
    expect(canProbeUpsideDown("h", 0)).toBe(false);
    expect(canProbeUpsideDown(null, 1)).toBe(false);
  });

  it("keeps the unflipped reading unless the flipped one is strictly more confident", () => {
    const plain = reading(0, 0.8);
    expect(preferFlippedReading(plain, reading(2, 0.81))).toBe(true);
    expect(preferFlippedReading(plain, reading(2, 0.8))).toBe(false);
    expect(preferFlippedReading(plain, reading(2, 0.79))).toBe(false);
  });
});
