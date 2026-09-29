import { describe, expect, it } from "bun:test";
import { decodeDetections } from "../../src/stages/detect/detector-io.ts";

describe("decodeDetections", () => {
  it("maps label ids, drops low scores and empty boxes, clamps and sorts by score", () => {
    const labels = BigInt64Array.from([0n, 1n, 2n, 1n, 7n]);
    const boxes = Float32Array.from([
      10, 10, 200, 300,
      -5, 20, 90, 1200,
      50, 50, 50.5, 80,
      30, 30, 60, 60,
      0, 0, 10, 10,
    ]);
    const scores = Float32Array.from([0.8, 0.95, 0.9, 0.2, 0.99]);
    expect(decodeDetections(labels, boxes, scores, 1000, 1100, 0.3)).toEqual([
      { cls: "text_bubble", score: expect.closeTo(0.95, 5), box: { x0: 0, y0: 20, x1: 90, y1: 1100 } },
      { cls: "bubble", score: expect.closeTo(0.8, 5), box: { x0: 10, y0: 10, x1: 200, y1: 300 } },
    ]);
  });
});
