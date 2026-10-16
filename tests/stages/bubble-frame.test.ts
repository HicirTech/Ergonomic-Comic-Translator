import { describe, expect, it } from "bun:test";
import { bubbleFrameReachOf, bubbleOrnamentBandOf } from "../../src/stages/mask/bubble-frame.ts";

describe("bubbleFrameReachOf", () => {
  it("reaches a twentieth of the shorter side into a large bubble, and twelve pixels at least into a small one", () => {
    expect(bubbleFrameReachOf({ x0: 0, y0: 0, x1: 400, y1: 600 })).toBe(20);
    expect(bubbleFrameReachOf({ x0: 0, y0: 0, x1: 240, y1: 600 })).toBe(12);
    // A small bubble's box stands off its frame by as many pixels as a large one's.
    expect(bubbleFrameReachOf({ x0: 0, y0: 0, x1: 90, y1: 170 })).toBe(12);
    // The band in which no marks are looked for keeps the share: punctuation set against the frame is text.
    expect(bubbleOrnamentBandOf({ x0: 0, y0: 0, x1: 90, y1: 170 })).toBe(4.5);
  });
});
