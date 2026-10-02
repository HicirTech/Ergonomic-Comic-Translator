import { describe, expect, it } from "bun:test";
import {
  bestQuarterTurn,
  cerGaps,
  characterErrorRate,
  chosenTurnIsBest,
  levenshtein,
  productReaderChoice,
  sentenceChoiceIsBest,
  writingModeMatches,
  matchByIou,
  referenceOrderIsClosest,
  strongResidualShare,
  verticalCerGapLimit,
  verticalCerWithinLimit,
} from "../../eval/metrics/ocr-metrics.ts";

describe("ocr metrics", () => {
  it("counts edits over code points, including an empty string", () => {
    expect(levenshtein([..."kitten"], [..."sitting"])).toBe(3);
    expect(levenshtein([], [])).toBe(0);
    expect(levenshtein([], [..."あ"])).toBe(1);
    expect(characterErrorRate("abc", "ab")).toBeCloseTo(1 / 3, 6);
    expect(characterErrorRate("", "")).toBe(0);
    expect(characterErrorRate("", "a")).toBe(1);
    expect(characterErrorRate("a", "")).toBe(1);
    expect(characterErrorRate("ＡＢＣ", "ABC")).toBe(0);
    expect(characterErrorRate("a b\nc", "abc")).toBe(0);
  });

  it("accepts the labelled line order only when it is strictly closest", () => {
    const lines = ["猫が見ている。", "お茶をください。", "明日散歩する。"];
    expect(referenceOrderIsClosest(lines, lines.join(""))).toBe(true);
    expect(referenceOrderIsClosest(lines, [...lines].reverse().join(""))).toBe(false);
    expect(referenceOrderIsClosest(["右", "左"], "右左")).toBe(true);
    expect(referenceOrderIsClosest(["右", "左"], "左右")).toBe(false);
    expect(referenceOrderIsClosest(lines, "")).toBe(false);
    expect(referenceOrderIsClosest(["同", "同"], "同同")).toBe(false);
    expect(referenceOrderIsClosest(["一行"], "一行")).toBe(false);
    expect(referenceOrderIsClosest(["a", "b", "c", "d", "e"], "abcde")).toBe(false);
  });

  it("scores writing mode apart from the sentence reader's chosen turn", () => {
    expect(writingModeMatches("v", "v")).toBe(true);
    expect(writingModeMatches("v", "h")).toBe(false);
    expect(writingModeMatches("h", null)).toBe(false);
    const baberu = [0.2, 0.5, 0.5, 0.5];
    const manga = [0.4, 0.4, 0.1, 0.3];
    expect(sentenceChoiceIsBest({ engine: "baberu", quarterTurns: 0 }, baberu, manga)).toBe(true);
    expect(sentenceChoiceIsBest({ engine: "baberu", quarterTurns: 1 }, baberu, manga)).toBe(false);
    expect(sentenceChoiceIsBest(null, baberu, manga)).toBe(false);
    expect(sentenceChoiceIsBest({ engine: "manga-ocr", quarterTurns: 2 }, baberu, manga)).toBe(true);
    expect(sentenceChoiceIsBest({ engine: "baberu", quarterTurns: 1 }, [0.2, 0.2, 0.5, 0.5], manga)).toBe(true);
    expect(productReaderChoice([])).toBeNull();
    expect(productReaderChoice([
      { engine: "baberu", quarterTurns: 0 },
      { engine: "manga-ocr", quarterTurns: 0 },
    ])).toBeNull();
    expect(productReaderChoice([
      { engine: "baberu", quarterTurns: 0 },
      { engine: "baberu", quarterTurns: 1 },
    ])).toBeNull();
    expect(productReaderChoice([
      { engine: "manga-ocr", quarterTurns: 2 },
      { engine: "manga-ocr", quarterTurns: 2 },
    ])).toEqual({ engine: "manga-ocr", quarterTurns: 2 });
  });

  it("matches boxes and the lowest quarter turn", () => {
    const cerByTurn = [0.4, 0.4, 0.2, 0.5];
    expect(bestQuarterTurn(cerByTurn)).toBe(2);
    expect(chosenTurnIsBest(cerByTurn, 0)).toBe(false);
    expect(chosenTurnIsBest([0.2, 0.2, 0.5, 0.5], 0)).toBe(true);
    const matches = matchByIou(
      [{ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 20, y0: 0, x1: 30, y1: 10 }],
      [{ x0: 20, y0: 0, x1: 30, y1: 10 }, { x0: 0, y0: 0, x1: 10, y1: 9 }],
    );
    expect(matches).toEqual([
      { referenceIndex: 1, predictedIndex: 0, iou: 1 },
      { referenceIndex: 0, predictedIndex: 1, iou: 0.9 },
    ]);
    expect(matchByIou([{ x0: 0, y0: 0, x1: 10, y1: 10 }], [{ x0: 100, y0: 100, x1: 110, y1: 110 }])).toEqual([]);
  });

  it("fails the vertical gap when there is no pair or the gap exceeds the limit", () => {
    expect(verticalCerWithinLimit([])).toBe(false);
    const close = cerGaps([
      { sentenceKey: "猫", direction: "h", cer: 0 },
      { sentenceKey: "猫", direction: "v", cer: verticalCerGapLimit },
      { sentenceKey: "茶", direction: "h", cer: 0.2 },
    ]);
    expect(close).toHaveLength(1);
    expect(verticalCerWithinLimit(close)).toBe(true);
    expect(verticalCerWithinLimit([{ sentenceKey: "猫", horizontalCer: 0, verticalCer: verticalCerGapLimit + 0.01 }])).toBe(false);
  });

  it("counts text pixels that stay far from the background", () => {
    const mask = Uint8Array.from([1, 1, 0]);
    const reference = Uint8Array.from([0, 0, 0, 10, 10, 10, 5, 5, 5]);
    const cleaned = Uint8Array.from([40, 0, 0, 10, 10, 10, 9, 9, 9]);
    expect(strongResidualShare(cleaned, reference, mask, 32)).toBe(0.5);
    expect(strongResidualShare(reference, reference, mask, 32)).toBe(0);
  });
});
