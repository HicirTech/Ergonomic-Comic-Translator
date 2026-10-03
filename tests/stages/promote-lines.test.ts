import { describe, expect, it } from "bun:test";
import type { OcrReading } from "../../src/stages/ocr/interfaces/index.ts";
import type { PageRegion } from "../../src/stages/regions/interfaces/index.ts";
import { promoteLines, worthReading } from "../../src/stages/regions/promote-lines.ts";
import { line } from "./fixtures.ts";

const read = (text: string, meanProb: number): OcrReading => ({ text, meanProb, minProb: meanProb / 2, tokens: [...text].length });

describe("worthReading", () => {
  const bubble = { x0: 500, y0: 500, x1: 800, y1: 700 };

  it("reads long lines, sure upright ones and every line in a bubble", () => {
    expect(worthReading(line(100, 100, 160, 50, 0, 0.5), [])).toBe(true);
    // Too short for five characters, and the line detector is not sure of it: no rule can take it.
    expect(worthReading(line(100, 100, 159, 50, 0, 0.5), [])).toBe(false);
    expect(worthReading(line(100, 100, 159, 50, 0, 0.95), [])).toBe(true);
    expect(worthReading(line(100, 100, 159, 50, 30, 0.95), [])).toBe(false);
    expect(worthReading({ ...line(100, 100, 159, 50, 0, 0.95), curved: true }, [])).toBe(false);
    expect(worthReading(line(600, 600, 60, 50, 30, 0.5), [bubble])).toBe(true);
  });
});

describe("promoteLines", () => {
  const first = line(300, 250, 456, 42, 0);
  const second = line(350, 293, 433, 46, 0);
  const elsewhere = line(900, 600, 300, 40, 90);

  it("turns confident dialogue lines into a region and groups neighbours", () => {
    const { regions, uncovered } = promoteLines([], [first, second, elsewhere], [read("これはどういうことなの……", 0.98), read("ちゃんと説明してよ！？", 0.89), read("誰か来たみたいだ", 0.95)], []);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ cls: null, score: null, bubble: null, lines: [first, second] });
    expect(regions[0]!.box).toEqual({ x0: 72, y0: 229, x1: 566.5, y1: 316 });
    expect(regions[1]!.lines).toEqual([elsewhere]);
    expect(uncovered).toEqual([]);
  });

  it("leaves art lettering uncovered: unsure, short, a sound, unread, or too short a rectangle", () => {
    const stubby = line(600, 100, 100, 60, 0, 0.5);
    const lines = [first, second, elsewhere, stubby, line(200, 500, 300, 40, 0)];
    const readings = [read("これはどういうことなの……", 0.84), read("ドキッ", 0.99), read("ビクビクッ", 0.99), read("これはどういうことなの", 0.99), undefined];
    const { regions, uncovered } = promoteLines([], lines, readings, []);
    expect(regions).toEqual([]);
    expect(uncovered).toEqual(lines);
  });

  it("keeps a slanted caption apart from the upright lines it touches", () => {
    const slanted = line(300, 270, 400, 40, 40);
    const { regions } = promoteLines([], [first, slanted], [read("これはどういうことなの……", 0.98), read("ちゃんと説明してよ！？", 0.9)], []);
    expect(regions.map((region) => region.lines)).toEqual([[first], [slanted]]);
  });

  it("takes short typeset text when it is upright and read almost with certainty", () => {
    const large = line(770, 630, 345, 178, 0, 0.99);
    expect(promoteLines([], [large], [read("はい", 1)], []).regions).toMatchObject([{ cls: null, bubble: null, lines: [large] }]);
    // One letter, a sound, a doubtful reading, a slanted or a curved line: art lettering.
    for (const [candidate, reading] of [
      [large, read("ん", 1)],
      [large, read("ドド", 1)],
      [large, read("はい", 0.94)],
      [line(770, 630, 345, 178, 20, 0.99), read("はい", 1)],
      [{ ...large, curved: true }, read("はい", 1)],
      [line(770, 630, 345, 178, 0, 0.8), read("はい", 1)],
    ] as const) {
      expect(promoteLines([], [candidate], [reading], []).regions).toEqual([]);
    }
  });

  it("takes short text only in the ink of the page's dialogue, when the page has dialogue", () => {
    const large = line(770, 630, 345, 178, 0, 0.99);
    const bubble = { x0: 40, y0: 40, x1: 600, y1: 200 };
    const dialogue = line(300, 120, 400, 40, 0);
    const region: PageRegion = { box: { x0: 100, y0: 100, x1: 500, y1: 140 }, cls: "text_bubble", score: 0.9, bubble, lines: [dialogue] };
    const otherInk = promoteLines([region], [large], [read("はい", 1)], [bubble], () => false);
    expect(otherInk.regions).toEqual([region]);
    expect(otherInk.uncovered).toEqual([large]);
    const asked: unknown[] = [];
    const sameInk = promoteLines([region], [large], [read("はい", 1)], [bubble], (candidate, others) => {
      asked.push([candidate, others]);
      return true;
    });
    expect(sameInk.regions.map((entry) => entry.lines)).toEqual([[dialogue], [large]]);
    expect(asked).toEqual([[large, [dialogue]]]);
  });

  it("gives a line read inside a bubble to the region of that bubble", () => {
    const bubble = { x0: 40, y0: 500, x1: 1240, y1: 720 };
    const dialogue = line(480, 570, 860, 54, 0);
    const region: PageRegion = { box: { x0: 46, y0: 511, x1: 919, y1: 635 }, cls: "text_bubble", score: 0.9, bubble, lines: [dialogue] };
    const missed = line(420, 630, 700, 50, 0);
    const mark = line(1100, 560, 30, 28, 0);
    const { regions, uncovered } = promoteLines([region], [missed, mark], [read("そうなんだ", 0.75), read("…", 0.9)], [bubble]);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.lines).toEqual([dialogue, missed]);
    expect(regions[0]!.box).toEqual({ x0: 46, y0: 511, x1: 919, y1: 655 });
    expect(regions[0]).toMatchObject({ cls: "text_bubble", score: 0.9, bubble });
    // A mark without a letter is no text of its own; the mask takes it when it continues a line.
    expect(uncovered).toEqual([mark]);
  });

  it("makes a region of its own for a line set clearly larger than the text of its bubble", () => {
    const bubble = { x0: 40, y0: 500, x1: 1240, y1: 720 };
    const dialogue = line(480, 570, 860, 54, 0);
    const region: PageRegion = { box: { x0: 46, y0: 511, x1: 919, y1: 635 }, cls: "text_bubble", score: 0.9, bubble, lines: [dialogue] };
    // 82 px against 54 px lines: an aside beside the dialogue, read and lettered on its own.
    const aside = line(980, 675, 243, 82, 0);
    const { regions, uncovered } = promoteLines([region], [aside], [read("ん…？", 0.97)], [bubble]);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toBe(region);
    expect(regions[1]).toMatchObject({ cls: null, score: null, bubble, lines: [aside] });
    expect(uncovered).toEqual([]);
  });

  it("leaves a line in a bubble alone when it is not set in the ink of that bubble's text", () => {
    const bubble = { x0: 40, y0: 500, x1: 1240, y1: 720 };
    const dialogue = line(480, 570, 860, 54, 0);
    const region: PageRegion = { box: { x0: 46, y0: 511, x1: 919, y1: 635 }, cls: "text_bubble", score: 0.9, bubble, lines: [dialogue] };
    // Art lettering drawn across the bubble: readable, but in its own colours.
    const lettering = line(1100, 600, 240, 110, 0);
    const asked: unknown[] = [];
    const { regions, uncovered } = promoteLines([region], [lettering], [read("ゴゴ", 0.9)], [bubble], (candidate, others) => {
      asked.push([candidate, others]);
      return false;
    });
    expect(regions).toEqual([region]);
    expect(uncovered).toEqual([lettering]);
    expect(asked).toEqual([[lettering, [dialogue]]]);
  });

  it("starts a region for a bubble that had none, and leaves a doubtful reading out", () => {
    const bubble = { x0: 0, y0: 500, x1: 1280, y1: 720 };
    const shout = line(770, 630, 345, 178, 10, 0.6);
    const { regions } = promoteLines([], [shout], [read("はい", 0.75)], [bubble]);
    expect(regions).toMatchObject([{ cls: null, score: null, bubble, lines: [shout] }]);
    expect(promoteLines([], [shout], [read("はい", 0.69)], [bubble]).regions).toEqual([]);
  });
});
