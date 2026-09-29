import { describe, expect, it } from "bun:test";
import type { Detection } from "../../src/stages/detect/interfaces/index.ts";
import { assignLines } from "../../src/stages/regions/assign-lines.ts";
import { consolidateDetections } from "../../src/stages/regions/consolidate.ts";
import { estimateOrientation, groupByDirection } from "../../src/stages/regions/orientation.ts";
import { line } from "./fixtures.ts";

const detection = (cls: Detection["cls"], x0: number, y0: number, x1: number, y1: number, score = 0.9): Detection => ({
  cls,
  score,
  box: { x0, y0, x1, y1 },
});

describe("consolidateDetections", () => {
  it("drops low scores and duplicate boxes, preferring text_bubble inside a bubble", () => {
    const { bubbles, candidates } = consolidateDetections([
      detection("bubble", 0, 0, 200, 300),
      detection("bubble", 2, 2, 201, 299, 0.8),
      detection("text_free", 40, 40, 160, 260, 0.95),
      detection("text_bubble", 42, 42, 158, 258, 0.7),
      detection("text_free", 500, 500, 600, 600, 0.3),
    ]);
    expect(bubbles).toHaveLength(1);
    expect(candidates).toEqual([{ box: { x0: 42, y0: 42, x1: 158, y1: 258 }, cls: "text_bubble", score: 0.7, bubbles: [0] }]);
  });

  it("folds contained boxes and merges text boxes of one bubble", () => {
    const { candidates } = consolidateDetections([
      detection("bubble", 0, 0, 400, 300),
      detection("text_bubble", 20, 20, 180, 280),
      detection("text_bubble", 30, 30, 90, 90, 0.95),
      detection("text_bubble", 220, 20, 380, 280),
    ]);
    expect(candidates).toEqual([{ box: { x0: 20, y0: 20, x1: 380, y1: 280 }, cls: "text_bubble", score: 0.95, bubbles: [0] }]);
  });

  it("records every bubble a wide text box touches", () => {
    const { candidates } = consolidateDetections([
      detection("bubble", 0, 0, 200, 200),
      detection("bubble", 210, 0, 400, 200),
      detection("text_bubble", 50, 50, 350, 150),
    ]);
    expect(candidates[0]!.bubbles).toEqual([0, 1]);
  });
});

describe("assignLines", () => {
  it("gives each line to one region, dedupes lines seen by two crops and reports uncovered text", () => {
    const candidates = [
      { box: { x0: 0, y0: 0, x1: 100, y1: 100 }, cls: "text_bubble" as const, score: 0.9, bubbles: [] },
      { box: { x0: 90, y0: 0, x1: 200, y1: 100 }, cls: "text_free" as const, score: 0.9, bubbles: [] },
    ];
    const shared = line(50, 50, 80, 20, 0);
    const { regions, uncovered } = assignLines(candidates, [], [[shared], [line(50, 51, 80, 20, 0, 0.8), line(150, 50, 60, 20, 90)]], [line(500, 500, 80, 20, 0)]);
    expect(regions.map((region) => region.lines.length)).toEqual([1, 1]);
    expect(regions[0]!.lines[0]).toBe(shared);
    expect(uncovered).toHaveLength(1);
  });

  it("splits a text box spanning two bubbles by the bubble each line sits in", () => {
    const bubbles = [{ x0: 0, y0: 0, x1: 200, y1: 200 }, { x0: 210, y0: 0, x1: 400, y1: 200 }];
    const candidate = { box: { x0: 50, y0: 20, x1: 350, y1: 180 }, cls: "text_bubble" as const, score: 0.9, bubbles: [0, 1] };
    const { regions } = assignLines([candidate], bubbles, [[line(100, 100, 120, 20, 90), line(300, 100, 120, 20, 90)]], []);
    expect(regions.map((region) => region.bubble)).toEqual(bubbles);
  });
});

describe("estimateOrientation", () => {
  it("reads vertical columns tilted by 20 degrees", () => {
    const columns = [line(100, 100, 150, 24, 90 + 20), line(130, 100, 150, 24, 90 + 20), line(160, 100, 120, 24, 90 + 20)];
    const orientation = estimateOrientation(columns, { x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(orientation.writingMode).toBe("v");
    expect(orientation.tilt).toBeCloseTo(20, 6);
    expect(orientation.consistency).toBeCloseTo(1, 6);
    expect(orientation.ambiguous).toBe(false);
    expect(orientation.frame.angle).toBeCloseTo(20, 6);
  });

  it("flags short lines and tilts near 45 degrees as ambiguous", () => {
    expect(estimateOrientation([line(10, 10, 20, 18, 0)], { x0: 0, y0: 0, x1: 1, y1: 1 })).toMatchObject({ writingMode: null, ambiguous: true });
    expect(estimateOrientation([line(10, 10, 200, 20, 35)], { x0: 0, y0: 0, x1: 1, y1: 1 })).toMatchObject({ writingMode: "h", ambiguous: true });
  });

  it("keeps the frame axis-aligned for tilts up to 5 degrees", () => {
    const orientation = estimateOrientation([line(100, 100, 200, 20, 4)], { x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(orientation.tilt).toBeCloseTo(4, 6);
    expect(orientation.frame.angle).toBe(0);
  });

  it("falls back to the detector box when there are no lines", () => {
    expect(estimateOrientation([], { x0: 10, y0: 20, x1: 30, y1: 60 }).frame).toEqual({ cx: 20, cy: 40, w: 20, h: 40, angle: 0 });
  });
});

describe("groupByDirection", () => {
  it("separates a tilted caption from upright columns and keeps short lines with the main group", () => {
    const columns = [line(100, 100, 150, 24, 90), line(130, 100, 150, 24, 88)];
    const caption = line(300, 300, 200, 20, 30);
    const shortMark = line(160, 40, 20, 18, 10);
    const groups = groupByDirection([...columns, caption, shortMark]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(expect.arrayContaining([...columns, shortMark]));
    expect(groups[1]).toEqual([caption]);
  });
});
