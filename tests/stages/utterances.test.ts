import { describe, expect, it } from "bun:test";
import type { UtteranceLine } from "../../src/stages/utterances/interfaces/index.ts";
import { splitUtterances, toUtteranceLines } from "../../src/stages/utterances/split-utterances.ts";
import { line } from "./fixtures.ts";

/** Horizontal line at row `top` with thickness 20. */
const row = (top: number, text = "", conf = 0, length = 200, thickness = 20): UtteranceLine => ({
  box: { x0: 0, y0: top, x1: length, y1: top + thickness },
  text,
  conf,
});

/** Vertical column whose right edge is at `right` (columns read right to left). */
const column = (right: number, text = "", conf = 0, thickness = 20): UtteranceLine => ({
  box: { x0: right - thickness, y0: 0, x1: right, y1: 200 },
  text,
  conf,
});

const groups = (splits: ReturnType<typeof splitUtterances>) => splits.map((split) => split.lines);

describe("splitUtterances", () => {
  it("keeps tightly spaced lines together", () => {
    expect(groups(splitUtterances([row(0), row(22), row(44)], "h"))).toEqual([[0, 1, 2]]);
  });

  it("cuts at a blank-line gap of 0.3 line thickness or more, for rows and columns", () => {
    expect(groups(splitUtterances([row(0), row(22), row(50), row(72)], "h"))).toEqual([[0, 1], [2, 3]]);
    expect(groups(splitUtterances([column(300), column(278), column(250)], "v"))).toEqual([[0, 1], [2]]);
  });

  it("cuts where a sentence ends and a new bracket opens, when OCR is trusted", () => {
    const lines = [row(0, "「行くぞ。」", 0.95), row(22, "「待って！」", 0.95)];
    expect(splitUtterances(lines, "h")[1]!.startReasons).toEqual(["close_open"]);
    expect(groups(splitUtterances(lines.map((entry) => ({ ...entry, conf: 0.5 })), "h"))).toEqual([[0, 1]]);
  });

  it("never cuts on a gap inside an open bracket", () => {
    const lines = [row(0, "「それはね、", 0.95), row(40, "ちがうの」", 0.95)];
    expect(groups(splitUtterances(lines, "h"))).toEqual([[0, 1]]);
  });

  it("separates a name tag and marks it", () => {
    const splits = splitUtterances([row(0, "【リン】", 0.95, 60), row(22, "おはよう", 0.95)], "h");
    expect(groups(splits)).toEqual([[0], [1]]);
    expect(splits[0]!.nameTag).toBe(true);
  });

  it("treats a font-size jump as a style span, not a new utterance", () => {
    const splits = splitUtterances([row(0, "", 0, 200, 20), row(22, "", 0, 300, 34)], "h");
    expect(groups(splits)).toEqual([[0, 1]]);
    expect(splits[0]!.styleBreaks).toEqual([1]);
  });

  it("ignores stray punctuation fragments when deciding cuts", () => {
    // A detached "…" below the text would otherwise look like a gap-separated second utterance.
    const lines = [row(0), row(22), { box: { x0: 0, y0: 70, x1: 12, y1: 82 }, text: "…", conf: 0.9 }];
    expect(groups(splitUtterances(lines, "h"))).toEqual([[0, 1, 2]]);
  });

  it("recognises inner monologue in parentheses", () => {
    expect(splitUtterances([row(0, "（どうしよう…", 0.9), row(22, "困った）", 0.9)], "h")[0]!.thought).toBe(true);
  });
});

describe("toUtteranceLines", () => {
  it("undoes the region tilt and orders columns right to left", () => {
    const tilted = [line(100, 100, 150, 20, 110), line(140, 100, 150, 20, 110)];
    const ordered = toUtteranceLines(tilted, { cx: 120, cy: 100, w: 60, h: 160, angle: 20 }, "v");
    expect(ordered[0]!.line).toBe(tilted[1]!);
    const width = ordered[0]!.box.x1 - ordered[0]!.box.x0;
    expect(width).toBeCloseTo(20, 6);
  });
});
