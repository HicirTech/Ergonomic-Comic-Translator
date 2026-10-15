import { describe, expect, it } from "bun:test";
import { dropDakutenMarks } from "../../src/stages/ocr/reading-marks.ts";

type MarkCase = [reading: string, cleaned: string];

describe("dropDakutenMarks", () => {
  it.each<MarkCase>([
    ["おぐぅ\"あ\"!", "おぐぅあ!"],
    ["もッう”むりィ", "もッうむりィ"],
    ["あ゛っ", "あっ"],
    ["「そう」と言った", "「そう」と言った"],
    ["he said \"no\"", "he said \"no\""],
  ])("reads %p as %p", (reading, cleaned) => {
    expect(dropDakutenMarks(reading)).toBe(cleaned);
  });
});
