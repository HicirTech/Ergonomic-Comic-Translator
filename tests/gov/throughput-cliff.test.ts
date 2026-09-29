import { describe, expect, it } from "bun:test";
import { ThroughputCliffDetector } from "../../src/gov/throughput-cliff.ts";

/** tg_3s at each second from tokens generated in each second. */
const rollingThreeSecond = (tokensPerSecond: number[]) =>
  tokensPerSecond.map((_, index) => {
    const window = tokensPerSecond.slice(Math.max(0, index - 2), index + 1);
    return window.reduce((sum, value) => sum + value, 0) / 3;
  });

/** Deterministic jitter in [low, high]. */
const jitter = (count: number, low: number, high: number) =>
  Array.from({ length: count }, (_, index) => low + ((index * 37) % 11) / 10 * (high - low));

const firstTrigger = (series: number[]) => {
  const detector = new ThroughputCliffDetector();
  return series.findIndex((value, second) => detector.add(second * 1000, value));
};

describe("ThroughputCliffDetector", () => {
  it("fires within 13 s of the incident's spill (66-118 tok/s falling to a 23.9 mean, 0.57 minimum)", () => {
    // Reconstructed from the incident summary: warm generation at 66-118 tok/s, then VRAM spilled into RAM.
    const warm = jitter(40, 66, 118);
    const spill = [30, 20, 25, 0.57, 28, 22, 26, 30, 24, 20, 23, 27, 25, 21, 24, 26, 22, 25, 23, 24];
    const series = rollingThreeSecond([...warm, ...spill]);
    const trigger = firstTrigger(series);
    expect(trigger).toBeGreaterThan(warm.length);
    expect(trigger - warm.length).toBeLessThanOrEqual(13);
  });

  it("stays quiet through normal jitter", () => {
    expect(firstTrigger(rollingThreeSecond(jitter(180, 66, 118)))).toBe(-1);
  });

  it("stays quiet through a short dip such as a prompt-processing pause", () => {
    const series = rollingThreeSecond([...jitter(30, 80, 100), 10, 10, 10, ...jitter(30, 80, 100)]);
    expect(firstTrigger(series)).toBe(-1);
  });

  it("does not fire before it has a healthy history", () => {
    expect(firstTrigger([5, 5, 5, 5, 5, 5, 5, 5])).toBe(-1);
  });

  it("forgets history on reset so idle gaps between requests never count", () => {
    const detector = new ThroughputCliffDetector();
    for (let second = 0; second < 20; second += 1) detector.add(second * 1000, 90);
    detector.reset();
    const fired = [5, 5, 5, 5, 5, 5, 5, 5].some((value, index) => detector.add((30 + index) * 1000, value));
    expect(fired).toBe(false);
  });
});
