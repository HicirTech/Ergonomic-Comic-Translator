import { describe, expect, it } from "bun:test";
import type { LineReading, OcrReading } from "../../src/stages/ocr/interfaces/index.ts";
import { joinLineReadings, preferLineReading } from "../../src/stages/ocr/line-reading.ts";

const read = (text: string, meanProb: number): OcrReading => ({ text, meanProb, minProb: meanProb / 2, tokens: [...text].length });
const lines = (text: string, lowestLineProb: number, meanProb = 0.95): LineReading => ({ text, meanProb, lowestLineProb });

type UnsureCase = [sentenceProb: number, linesProb: number, isTaken: boolean];
type KeptCase = [text: string, sentenceReading: string, isTaken: boolean, linesText: string, sentence: OcrReading | null];

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
  const forty = "あ".repeat(40);
  const latin = "The cat waits by the door all day, and then it sleeps.";

  it("reads kana and Han text of 40 characters or more by its lines when every line was read with confidence", () => {
    expect(preferLineReading(read(forty, 0.98), lines(forty, 0.85))).toBe(true);
    expect(preferLineReading(read(forty, 0.98), lines(forty, 0.84))).toBe(false);
    expect(preferLineReading(read("あ".repeat(39), 0.98), lines("あ".repeat(39), 0.85))).toBe(false);
    expect(preferLineReading(null, lines(forty, 0.84))).toBe(false);
    expect(preferLineReading(read(forty, 0.5), null)).toBe(false);
  });

  it.each<KeptCase>([
    ["short kana", "sure and whole", false, twenty, read(twenty, 0.98)],
    ["short kana", "unsure", true, twenty, read(twenty, 0.79)],
    ["short kana", "less than a fifth shorter", false, twenty, read("あ".repeat(16), 0.98)],
    ["short kana", "a fifth shorter", true, twenty, read("あ".repeat(15), 0.98)],
    ["short kana", "empty", true, twenty, read("", 0)],
    ["short kana", "missing", true, twenty, null],
    ["long Latin", "sure and whole", false, latin, read(latin, 0.98)],
    ["long Latin", "unsure", true, latin, read(latin, 0.79)],
    ["long Latin", "less than a fifth shorter", false, latin, read("a".repeat(35), 0.98)],
    ["long Latin", "a fifth shorter", true, latin, read("a".repeat(34), 0.98)],
  ])("%s text with a sentence reading that is %s: its lines are taken: %p", (_text, _sentenceReading, isTaken, linesText, sentence) => {
    expect(preferLineReading(sentence, lines(linesText, 0.9))).toBe(isTaken);
  });

  it.each<UnsureCase>([
    [0.7, 0.85, true],
    [0.7, 0.75, false],
    [0.8, 0.95, false],
  ])("with one weak line, a sentence reading at %p gives way to lines read at %p on average: %p", (sentenceProb, linesProb, isTaken) => {
    expect(preferLineReading(read(twenty, sentenceProb), lines(twenty, 0.5, linesProb))).toBe(isTaken);
  });
});
