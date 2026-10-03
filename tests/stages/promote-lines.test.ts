import { describe, expect, it } from "bun:test";
import type { OcrReading } from "../../src/stages/ocr/interfaces/index.ts";
import { promoteLines, worthReading } from "../../src/stages/regions/promote-lines.ts";
import { line } from "./fixtures.ts";

const read = (text: string, meanProb: number): OcrReading => ({ text, meanProb, minProb: meanProb / 2, tokens: [...text].length });

describe("worthReading", () => {
  it("skips rectangles too short to hold five characters", () => {
    expect(worthReading(line(100, 100, 160, 50, 0))).toBe(true);
    expect(worthReading(line(100, 100, 159, 50, 0))).toBe(false);
    expect(worthReading(line(100, 100, 50, 160, 90))).toBe(false);
  });
});

describe("promoteLines", () => {
  const first = line(300, 250, 456, 42, 0);
  const second = line(350, 293, 433, 46, 0);
  const elsewhere = line(900, 600, 300, 40, 90);

  it("turns confident dialogue lines into a region and groups neighbours", () => {
    const { regions, uncovered } = promoteLines([first, second, elsewhere], [read("これはどういうことなの……", 0.98), read("ちゃんと説明してよ！？", 0.89), read("誰か来たみたいだ", 0.95)]);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ cls: null, score: null, bubble: null, lines: [first, second] });
    expect(regions[0]!.box).toEqual({ x0: 72, y0: 229, x1: 566.5, y1: 316 });
    expect(regions[1]!.lines).toEqual([elsewhere]);
    expect(uncovered).toEqual([]);
  });

  it("leaves art lettering uncovered: unsure, short, a sound, unread, or too short a rectangle", () => {
    const stubby = line(600, 100, 100, 60, 0);
    const lines = [first, second, elsewhere, stubby, line(200, 500, 300, 40, 0)];
    const readings = [read("これはどういうことなの……", 0.84), read("ドキッ", 0.99), read("ビクビクッ", 0.99), read("これはどういうことなの", 0.99), undefined];
    const { regions, uncovered } = promoteLines(lines, readings);
    expect(regions).toEqual([]);
    expect(uncovered).toEqual(lines);
  });

  it("keeps a slanted caption apart from the upright lines it touches", () => {
    const slanted = line(300, 270, 400, 40, 40);
    const { regions } = promoteLines([first, slanted], [read("これはどういうことなの……", 0.98), read("ちゃんと説明してよ！？", 0.9)]);
    expect(regions.map((region) => region.lines)).toEqual([[first], [slanted]]);
  });
});
