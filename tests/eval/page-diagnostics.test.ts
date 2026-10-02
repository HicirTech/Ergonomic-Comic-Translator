import { describe, expect, it } from "bun:test";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import type { TextLine } from "../../src/stages/lines/interfaces/index.ts";
import { scoreSyntheticPage } from "../../eval/cli/score-page.ts";
import { attributeOutsideChanges, falsePositivesOf } from "../../eval/cli/page-diagnostics.ts";
import { formatSummaryZh } from "../../eval/cli/format-summary-zh.ts";
import { buildOcrReport } from "../../eval/cli/summarize-ocr.ts";
import type { SyntheticPage } from "../../eval/synthetic/interfaces/index.ts";
import { bubblePadPx } from "../../eval/synthetic/constants.ts";

const rgb = (width: number, height: number, value: number): RgbImage => {
  const data = new Uint8Array(width * height * 3);
  data.fill(value);
  return { data, width, height };
};

const setPixel = (image: RgbImage, x: number, y: number, value: number) => {
  image.data.fill(value, (y * image.width + x) * 3, (y * image.width + x) * 3 + 3);
};

const quad = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
] as SyntheticPage["blocks"][number]["polygon"];

const pageOf = (background: SyntheticPage["background"], bubble: boolean): SyntheticPage => ({
  id: "p",
  seed: 1,
  index: 0,
  width: 8,
  height: 8,
  background,
  blocks: [{
    id: "b0",
    kind: "h-line",
    direction: "h",
    angle: 0,
    readingOrder: 0,
    sentenceKey: "s",
    bubble,
    fontSize: 18,
    cx: 20,
    cy: 20,
    width: 40,
    height: 40,
    polygon: quad(0, 0, 40, 40),
    lines: [{ text: "glyph", order: 0, polygon: quad(0, 0, 40, 40), cx: 20, cy: 20, width: 40, height: 40 }],
  }],
});

const region = (
  box: Box,
  clean: "flat" | "inpaint",
  policy: "translate" | "keep",
): PageVisionResult["regions"][number] => ({
  box,
  cls: policy === "keep" ? "text_free" : "text_bubble",
  bubble: null,
  lines: [{ } as TextLine],
  orientation: { tilt: 0, consistency: 1, writingMode: "h", ambiguous: false, frame: { cx: 1, cy: 1, w: 2, h: 2, angle: 0 } },
  classification: { layout: "text_free", kind: policy === "keep" ? "sfx" : "dialogue", policy },
  clean,
  utterances: [],
});

describe("outside-mask damage", () => {
  it("attributes a changed pixel to the matched region ahead of a false positive, and the rest to neither", () => {
    const width = 8;
    const height = 8;
    const original = rgb(width, height, 100);
    const cleaned = rgb(width, height, 100);
    setPixel(cleaned, 1, 1, 0);
    setPixel(cleaned, 5, 5, 0);
    setPixel(cleaned, 7, 1, 0);
    const mask = new Uint8Array(width * height);
    mask[0] = 1;
    setPixel(cleaned, 0, 0, 0);
    const split = attributeOutsideChanges(original.data, cleaned.data, width, height, mask, [
      { box: { x0: 0, y0: 0, x1: 3, y1: 3 }, clean: "flat", matched: true },
      { box: { x0: 0, y0: 0, x1: 6, y1: 6 }, clean: "inpaint", matched: false },
    ]);
    expect(split).toEqual({
      changed: 3,
      insideMatched: 1,
      insideFalsePositive: 1,
      outsideRegions: 1,
      flat: 1,
      inpaint: 1,
      kept: 0,
      none: 0,
    });
  });
});

describe("false positive surfaces", () => {
  it("uses the bubble disc, then the page background the generator painted", () => {
    const paper = pageOf("paper", true);
    const bubbleBox = { x0: 10, y0: 10, x1: 30, y1: 30 };
    const outside = { x0: 200, y0: 200, x1: 220, y1: 210 };
    const regions = [region({ x0: 0, y0: 0, x1: 40, y1: 40 }, "flat", "translate"), region(bubbleBox, "inpaint", "keep"), region(outside, "flat", "translate")];
    const claimed = new Set([0]);
    expect(falsePositivesOf(paper, regions, claimed).map((item) => item.surface)).toEqual(["bubble", "plain-paper"]);
    expect(falsePositivesOf(pageOf("texture", true), regions, claimed).map((item) => item.surface)).toEqual(["bubble", "texture-or-noise"]);
    expect(bubblePadPx).toBeGreaterThan(0);
    const [kept] = falsePositivesOf(paper, regions, claimed);
    expect(kept).toMatchObject({ cls: "text_free", clean: "inpaint", classification: { policy: "keep" }, width: 20, height: 20, area: 400 });
  });
});

describe("synthetic page diagnostics", () => {
  it("records an uncovered region and splits cleaned pixels outside the text mask", async () => {
    const page = pageOf("paper", false);
    page.blocks[0] = {
      ...page.blocks[0]!,
      polygon: quad(0, 0, 2, 2),
      cx: 1,
      cy: 1,
      width: 2,
      height: 2,
      lines: [{ text: "glyph", order: 0, polygon: quad(0, 0, 2, 2), cx: 1, cy: 1, width: 2, height: 2 }],
    };
    const background = rgb(8, 8, 100);
    const cleaned = rgb(8, 8, 100);
    setPixel(cleaned, 0, 0, 0);
    setPixel(cleaned, 4, 4, 0);
    setPixel(cleaned, 7, 7, 0);
    const matched = region({ x0: 0, y0: 0, x1: 2, y1: 2 }, "flat", "translate");
    const extra = region({ x0: 4, y0: 4, x1: 6, y1: 6 }, "inpaint", "keep");
    const vision: PageVisionResult = {
      width: 8,
      height: 8,
      uncovered: [],
      cleanedPath: "",
      timingsMs: {},
      regions: [matched, extra],
    };
    const scored = await scoreSyntheticPage(
      page,
      vision,
      background,
      cleaned,
      new Uint8Array(64),
      [[]],
      [[]],
      [[]],
      [],
    );
    expect(scored.falsePositives).toHaveLength(1);
    expect(scored.falsePositives[0]).toMatchObject({
      cls: "text_free",
      clean: "inpaint",
      surface: "plain-paper",
      classification: { layout: "text_free", kind: "sfx", policy: "keep" },
    });
    expect(scored.removal.changesOutsideDilatedMask).toBe(3);
    expect(scored.removal.damage).toMatchObject({
      changed: 3,
      insideMatched: 1,
      insideFalsePositive: 1,
      outsideRegions: 1,
      flat: 1,
      inpaint: 1,
    });
    const text = formatSummaryZh(buildOcrReport(1, false, [scored]));
    expect(text).toContain("误检 1");
    expect(text).toContain("白纸 1");
    expect(text).toContain("平涂 1.0");
    expect(text).not.toContain("glyph");
  });
});
