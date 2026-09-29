import { describe, expect, it } from "bun:test";
import { SlidingPeak } from "../../src/gov/sliding-peak.ts";
import { SustainedCondition } from "../../src/gov/sustained-condition.ts";

describe("SlidingPeak", () => {
  it("returns the maximum inside the window and forgets older peaks", () => {
    const peak = new SlidingPeak(120_000);
    peak.add(0, 5);
    peak.add(10_000, 9);
    peak.add(20_000, 7);
    expect(peak.peak(20_000)).toBe(9);
    expect(peak.peak(129_999)).toBe(9);
    expect(peak.peak(130_000)).toBe(7);
    expect(peak.peak(140_001)).toBeNull();
  });
});

describe("SustainedCondition", () => {
  it("fires only after the condition held for the whole period", () => {
    const busy = new SustainedCondition(30_000);
    expect(busy.update(0, true)).toBe(false);
    expect(busy.update(29_000, true)).toBe(false);
    expect(busy.update(30_000, true)).toBe(true);
    expect(busy.update(31_000, false)).toBe(false);
    expect(busy.update(32_000, true)).toBe(false);
  });
});
