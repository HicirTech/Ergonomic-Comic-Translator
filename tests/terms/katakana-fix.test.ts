import { describe, expect, it } from "bun:test";
import { correctKatakana, correctedRun } from "../../src/terms/katakana-fix.ts";

const dictionary = { has: (form: string) => ["ピンポーン", "ガチャ", "アンデッド", "バス", "パス", "ジョン"].includes(form) };

type RunCase = [run: string, word: string | null];

describe("katakana correction", () => {
  it.each<RunCase>([
    ["ピンホーン", "ピンポーン"],
    ["ガチヤ", "ガチャ"],
    ["アンデツド", "アンデッド"],
    ["アンデッド", null],
    ["ハス", null],
    ["ルセェ", null],
  ])("reads %p as %p", (run, word) => {
    expect(correctedRun(run, dictionary)).toBe(word);
  });

  it("replaces the misread words of a text and lists them, but leaves a name with an honorific alone", () => {
    const fixed = correctKatakana("ピンホーン・・・ガチヤちゃん…ガチヤ！", dictionary);
    expect(fixed.text).toBe("ピンポーン・・・ガチヤちゃん…ガチャ！");
    expect(fixed.changes).toEqual([["ピンホーン", "ピンポーン"], ["ガチヤ", "ガチャ"]]);
  });

  it("leaves the tail of a compound after a kanji alone", () => {
    expect(correctKatakana("野ションで", dictionary)).toEqual({ text: "野ションで", changes: [] });
    expect(correctKatakana("私たちアンデツドは", dictionary).text).toBe("私たちアンデッドは");
  });
});
