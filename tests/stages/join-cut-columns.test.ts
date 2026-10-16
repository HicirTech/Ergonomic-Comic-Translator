import { describe, expect, it } from "bun:test";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { PageRegion } from "../../src/stages/regions/interfaces/index.ts";
import { isBlockRegion, joinCutColumns } from "../../src/stages/regions/join-cut-columns.ts";
import { line } from "./fixtures.ts";

const bubble: Box = { x0: 0, y0: 0, x1: 300, y1: 400 };

/** Two vertical columns of dialogue in the upper half of the bubble. */
const columns = (overrides: Partial<PageRegion> = {}): PageRegion => ({
  box: { x0: 100, y0: 20, x1: 200, y1: 220 },
  cls: "text_bubble",
  score: 0.9,
  bubble,
  lines: [line(125, 120, 200, 40, 90), line(175, 120, 200, 40, 90)],
  ...overrides,
});

/** The block the detector draws around the rest of the columns below the lettering that cuts them. */
const block = (overrides: Partial<PageRegion> = {}): PageRegion => ({
  box: { x0: 95, y0: 215, x1: 205, y1: 330 },
  cls: "text_bubble",
  score: 0.9,
  bubble,
  lines: [line(150, 272, 110, 100, 90)],
  ...overrides,
});

const holdsInk = () => true;

describe("joinCutColumns", () => {
  it("tells a block from a line", () => {
    expect(isBlockRegion(block())).toBe(true);
    expect(isBlockRegion(columns())).toBe(false);
  });

  it("draws the columns on over the block in their way and drops the block", () => {
    const joined = joinCutColumns([columns(), block()], holdsInk);

    expect(joined).toHaveLength(1);
    expect(joined[0]!.box).toEqual({ x0: 95, y0: 20, x1: 205, y1: 330 });
    const [left, right] = joined[0]!.lines;
    expect(left!.rect.center).toEqual({ x: 125, y: 175 });
    expect(left!.rect.long).toBe(310);
    expect(left!.rect.short).toBe(40);
    expect(right!.rect.center.x).toBe(175);
    expect(Math.min(...left!.quad.map((point) => point.y))).toBeCloseTo(20, 5);
    expect(Math.max(...left!.quad.map((point) => point.y))).toBeCloseTo(330, 5);
  });

  it("leaves a block that does not hold the ink of the lines", () => {
    expect(joinCutColumns([columns(), block()], () => false)).toHaveLength(2);
  });

  it("joins a block in a second bubble that overlaps the lines' bubble, and takes both bubbles as one", () => {
    const joined = joinCutColumns([columns(), block({ bubble: { x0: 0, y0: 210, x1: 300, y1: 600 } })], holdsInk);
    expect(joined).toHaveLength(1);
    expect(joined[0]!.lines[0]!.rect.long).toBe(310);
    expect(joined[0]!.bubble).toEqual({ x0: 0, y0: 0, x1: 300, y1: 600 });
  });

  it("asks for a glyph's worth of the lines' ink: a quarter of a thickness square", () => {
    const asked: number[] = [];
    joinCutColumns([columns(), block()], (_block, _host, minPixels) => {
      asked.push(minPixels);
      return true;
    });
    expect(asked).toEqual([400]);
  });

  it("leaves a block in another bubble, beside the lines, or far from them", () => {
    expect(joinCutColumns([columns(), block({ bubble: { x0: 0, y0: 500, x1: 300, y1: 900 } })], holdsInk)).toHaveLength(2);
    expect(joinCutColumns([columns(), block({ box: { x0: 210, y0: 20, x1: 300, y1: 130 } })], holdsInk)).toHaveLength(2);
    expect(joinCutColumns([columns(), block({ box: { x0: 95, y0: 270, x1: 205, y1: 380 } })], holdsInk)).toHaveLength(2);
  });

  it("leaves two regions of lines alone", () => {
    const lower = columns({ box: { x0: 100, y0: 230, x1: 200, y1: 380 }, lines: [line(125, 305, 150, 40, 90)] });
    const joined = joinCutColumns([columns(), lower], holdsInk);
    expect(joined).toHaveLength(2);
    expect(joined[0]!.lines[0]!.rect.long).toBe(200);
  });
});
