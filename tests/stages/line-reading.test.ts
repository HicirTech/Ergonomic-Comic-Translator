import { describe, expect, it } from "bun:test";
import type { LineReading, OcrReading } from "../../src/stages/ocr/interfaces/index.ts";
import { joinLineReadings, preferLineReading } from "../../src/stages/ocr/line-reading.ts";

const read = (text: string, meanProb: number): OcrReading => ({ text, meanProb, minProb: meanProb / 2, tokens: [...text].length });
const lines = (text: string, lowestLineProb: number, meanProb = 0.95): LineReading => ({ text, meanProb, lowestLineProb });

type UnsureCase = [sentenceProb: number, linesProb: number, isTaken: boolean];

describe("joinLineReadings", () => {
  it("joins the lines in the given order and keeps the least confident line's probability", () => {
    const joined = joinLineReadings([read("今日はいい", 0.9), read(" 天気ですね。 ", 1)]);
    expect(joined!.text).toBe("今日はいい天気ですね。");
    expect(joined!.meanProb).toBeCloseTo((0.9 * 5 + 1 * 6) / 11, 10);
    expect(joined!.lowestLineProb).toBe(0.9);
  });

  it("leaves out unread lines and unsure splinters, but keeps a short line read with confidence", () => {
    const joined = joinLineReadings([read("そうだね", 0.95), undefined, read("", 0), read("：", 0.3), read("え？", 0.92)]);
    expect(joined).toEqual({ text: "そうだねえ？", meanProb: (0.95 * 4 + 0.92 * 2) / 6, lowestLineProb: 0.92 });
  });

  it("has nothing to offer when no line was read", () => {
    expect(joinLineReadings([])).toBeNull();
    expect(joinLineReadings([undefined, read("", 0), read("x", 0.2)])).toBeNull();
  });
});

describe("preferLineReading", () => {
  const twenty = "あ".repeat(20);

  it("takes the lines when the sentence reader lost a fifth of the text or more", () => {
    expect(preferLineReading(read("あ".repeat(15), 0.98), lines(twenty, 0.9))).toBe(true);
    expect(preferLineReading(read("あ".repeat(16), 0.98), lines(twenty, 0.9))).toBe(false);
  });

  it("takes the lines when the sentence reader is unsure or read nothing", () => {
    expect(preferLineReading(read(twenty, 0.79), lines(twenty, 0.9))).toBe(true);
    expect(preferLineReading(read(twenty, 0.8), lines(twenty, 0.9))).toBe(false);
    expect(preferLineReading(read("", 0), lines(twenty, 0.9))).toBe(true);
    expect(preferLineReading(null, lines(twenty, 0.9))).toBe(true);
  });

  it("keeps a sure sentence reading that lost text unless every line was read with confidence", () => {
    expect(preferLineReading(read("あ".repeat(5), 0.9), lines(twenty, 0.84))).toBe(false);
    expect(preferLineReading(read("あ".repeat(5), 0.9), lines(twenty, 0.85))).toBe(true);
    expect(preferLineReading(read("あ".repeat(5), 0.5), null)).toBe(false);
  });

  it.each<UnsureCase>([
    [0.7, 0.85, true],
    [0.7, 0.75, false],
    [0.8, 0.95, false],
  ])("with one weak line, a sentence reading at %p gives way to lines read at %p on average: %p", (sentenceProb, linesProb, isTaken) => {
    expect(preferLineReading(read(twenty, sentenceProb), lines(twenty, 0.5, linesProb))).toBe(isTaken);
  });
});
