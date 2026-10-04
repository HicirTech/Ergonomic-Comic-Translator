import { describe, expect, it } from "bun:test";
import type { LineReading, OcrReading } from "../../src/stages/ocr/interfaces/index.ts";
import { joinLineReadings, preferLineReading } from "../../src/stages/ocr/line-reading.ts";

const read = (text: string, meanProb: number): OcrReading => ({ text, meanProb, minProb: meanProb / 2, tokens: [...text].length });
const lines = (text: string, lowestLineProb: number, meanProb = 0.95): LineReading => ({ text, meanProb, lowestLineProb });

type UnsureCase = [sentenceProb: number, linesProb: number, isTaken: boolean];
type KanaCase = [sentenceReading: string, isTaken: boolean, sentence: OcrReading | null];
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
  const japanese = "喉に絡みます";
  const han = "今天天氣很好請把門關上我在這裡";
  const latin = "The cat waits by the door all day, and then it sleeps.";

  it.each<KanaCase>([
    ["another character in place", true, read("娘に絡みます", 0.98)],
    ["the same letters and other marks", false, read("喉に絡みます．．．♥", 0.98)],
    ["a character more than the lines", false, read("喉にも絡みます", 0.98)],
    ["fewer characters than the lines", true, read("喉に絡み", 0.98)],
    ["the same letters, read unsure", true, read(japanese, 0.79)],
    ["no text", true, read("", 0)],
    ["nothing read", true, null],
  ])("Japanese lines read with confidence against a sentence reading with %s: they are taken: %p", (_sentenceReading, isTaken, sentence) => {
    expect(preferLineReading(sentence, lines(japanese, 0.85))).toBe(isTaken);
  });

  it("keeps a sure sentence reading when one of the lines was read without confidence", () => {
    expect(preferLineReading(read("娘に絡みます", 0.98), lines(japanese, 0.84))).toBe(false);
    expect(preferLineReading(null, lines(japanese, 0.84))).toBe(false);
    expect(preferLineReading(read(japanese, 0.5), null)).toBe(false);
  });

  it.each<KeptCase>([
    ["Han", "sure and whole", false, han, read(han, 0.98)],
    ["Han", "sure, with another character in place", false, han, read("今天天氣很好請把門關上我在這裏", 0.98)],
    ["Han", "unsure", true, han, read(han, 0.79)],
    ["Han", "less than a fifth shorter", false, han, read("今".repeat(12), 0.98)],
    ["Han", "a fifth shorter", true, han, read("今".repeat(11), 0.98)],
    ["Latin", "sure and whole", false, latin, read(latin, 0.98)],
    ["Latin", "a fifth shorter", true, latin, read("a".repeat(34), 0.98)],
  ])("%s text without kana and a sentence reading that is %s: its lines are taken: %p", (_text, _sentenceReading, isTaken, linesText, sentence) => {
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
