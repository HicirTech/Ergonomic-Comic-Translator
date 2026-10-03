import { describe, expect, it } from "bun:test";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import type { TextLine } from "../../src/stages/lines/interfaces/index.ts";
import { formatRealSummaryZh } from "../../eval/cli/format-real-summary-zh.ts";
import { buildRealReport, damageAgainstOriginal, damageLevel, residualStrokeShare, scoreRealPair, textStrokeMask } from "../../eval/cli/real-score.ts";
import { defaultLineModel, parseLineModel } from "../../eval/cli/parse-line-model.ts";
import { parseRealEvalArgs } from "../../eval/cli/parse-real-eval-options.ts";
import { summarizeGroundTruth } from "../../eval/ground-truth/summarize-ground-truth.ts";
import { deriveTextAreas } from "../../eval/ground-truth/textless-diff.ts";
import { line } from "../stages/fixtures.ts";

const blank = (width: number, height: number, value: number): RgbImage => {
  const data = new Uint8Array(width * height * 3);
  data.fill(value);
  return { data, width, height };
};

const paint = (image: RgbImage, x0: number, y0: number, x1: number, y1: number, value: number) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) image.data.fill(value, (y * image.width + x) * 3, (y * image.width + x) * 3 + 3);
  }
};

describe("text stroke pixels", () => {
  it("keeps mask pixels where the text page is darker by at least diffLevel", () => {
    const text = blank(80, 80, 100);
    const textless = blank(80, 80, 100);
    paint(textless, 8, 8, 48, 48, 180);
    paint(text, 8, 8, 48, 48, 250);
    paint(text, 20, 20, 40, 40, 0);
    const { mask } = deriveTextAreas(text, textless);
    const strokes = textStrokeMask(text, textless, mask);
    const at = (x: number, y: number) => y * 80 + x;
    expect(mask[at(30, 30)]).toBe(1);
    expect(strokes[at(30, 30)]).toBe(1);
    expect(mask[at(12, 24)]).toBe(1);
    expect(strokes[at(12, 24)]).toBe(0);
  });
});

describe("damage against the original text page", () => {
  it("splits pixels outside the dilated mask into inside a region and outside every region", () => {
    const original = blank(30, 30, 100);
    const cleaned = blank(30, 30, 100);
    const mask = new Uint8Array(30 * 30);
    mask[2 * 30 + 2] = 1;
    paint(cleaned, 20, 20, 21, 21, 0);
    paint(cleaned, 28, 8, 29, 9, 0);
    paint(cleaned, 15, 15, 16, 16, 100 - 10);
    const damage = damageAgainstOriginal(original, cleaned, mask, [{ x0: 18, y0: 18, x1: 24, y1: 24 }]);
    expect(damage).toEqual({ damageCount: 2, damageShare: 2 / 900, damageInsideRegion: 1, damageOutsideRegion: 1 });
    expect(10).toBeLessThan(damageLevel);
  });

  it("counts a stroke as residual only while the cleaned pixel stays near the original", () => {
    const original = blank(4, 4, 0);
    const cleaned = blank(4, 4, 0);
    paint(cleaned, 1, 0, 2, 1, 255);
    const strokes = new Uint8Array(16);
    strokes[0] = 1;
    strokes[1] = 1;
    expect(residualStrokeShare(original, cleaned, strokes)).toEqual({ strokePixels: 2, residualStrokeShare: 0.5 });
  });
});

describe("real eval options", () => {
  it("keeps a positional when no option is present, with the mobile line model", () => {
    const parsed = parseRealEvalArgs(["volume.cbz"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toEqual({ out: null, pages: null, lines: "mobile", gpu: false, groundTruthOnly: false, positionals: ["volume.cbz"] });
  });

  it("does not treat the value of a present option as a positional", () => {
    const parsed = parseRealEvalArgs(["--pages", "2", "a.cbz", "--lines", "server", "--out", "D:\\real-out", "b.zip", "--gpu"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toEqual({ out: "D:\\real-out", pages: 2, lines: "server", gpu: true, groundTruthOnly: false, positionals: ["a.cbz", "b.zip"] });
  });

  it("builds the ground truth alone on the CPU, so it refuses --gpu", () => {
    const parsed = parseRealEvalArgs(["--ground-truth-only", "volume.cbz"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toMatchObject({ groundTruthOnly: true, gpu: false, positionals: ["volume.cbz"] });
    expect(parseRealEvalArgs(["--ground-truth-only", "--gpu", "volume.cbz"]).ok).toBe(false);
  });

  it("keeps the positional that follows --lines", () => {
    const parsed = parseRealEvalArgs(["--lines", "mobile", "volume.cbz"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toMatchObject({ lines: "mobile", positionals: ["volume.cbz"] });
  });

  it("rejects a missing value, zero pages, an unknown line model and an unknown flag", () => {
    expect(parseRealEvalArgs(["--pages"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--out"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--lines"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--lines", "--gpu"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--lines", "tiny"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--pages", "0"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--gpu", "--seed"]).ok).toBe(false);
  });
});

describe("line model flag", () => {
  it("accepts the two model names and nothing else, not even inherited property names", () => {
    expect(defaultLineModel).toBe("mobile");
    expect(parseLineModel("mobile")).toBe("mobile");
    expect(parseLineModel("server")).toBe("server");
    for (const value of ["", "Server", "mobile ", "toString", "__proto__", "constructor"]) {
      expect(parseLineModel(value)).toBeNull();
    }
  });
});

/** Text page with three dark squares; the textless page is bare, so each square becomes a reference box. */
const pageWithThreeSquares = () => {
  const text = blank(600, 200, 200);
  for (const x of [0, 200, 400]) paint(text, x, 0, x + 100, 100, 0);
  return { text, textless: blank(600, 200, 200) };
};

const boxLine = (box: Box): TextLine => line((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, box.x1 - box.x0, box.y1 - box.y0, 0);

const regionWith = (box: Box, lines: Box[]): PageVisionResult["regions"][number] => ({
  box,
  cls: null,
  bubble: null,
  lines: lines.map(boxLine),
  orientation: { tilt: 0, consistency: 1, writingMode: "h", ambiguous: false, frame: { cx: 0, cy: 0, w: 1, h: 1, angle: 0 } },
  classification: { layout: "text_free", kind: "free_text", policy: "translate" },
  clean: "flat",
  utterances: [],
});

const identity = { id: "p0001", textOrdinal: 1, textlessOrdinal: 2, textSha256: "a", textlessSha256: "b" };

describe("page line recall", () => {
  const { text, textless } = pageWithThreeSquares();
  /**
   * Square 1: a region covers 30% and holds a line over 25% of it, so regions plus their own lines
   * must stay below half. Square 2: only an uncovered line covers it. Square 3: only a region covers it.
   */
  const vision: Pick<PageVisionResult, "regions" | "uncovered" | "timingsMs"> = {
    regions: [
      regionWith({ x0: 0, y0: 0, x1: 100, y1: 30 }, [{ x0: 0, y0: 0, x1: 100, y1: 25 }]),
      regionWith({ x0: 400, y0: 0, x1: 500, y1: 100 }, [{ x0: 400, y0: 0, x1: 450, y1: 20 }]),
    ],
    uncovered: [boxLine({ x0: 200, y0: 0, x1: 300, y1: 80 }), boxLine({ x0: 500, y0: 150, x1: 550, y1: 170 })],
    timingsMs: { lines: 99, page_lines: 12.5 },
  };

  it("measures regions alone, regions with uncovered lines, and lines alone without counting a region's lines twice", () => {
    const scored = scoreRealPair(identity, text, textless, textless, vision);
    expect(scored.referenceBoxes).toHaveLength(3);
    expect(scored.detectionRecall).toBeCloseTo(1 / 3, 10);
    expect(scored.regionLineRecall).toBeCloseTo(2 / 3, 10);
    expect(scored.lineRecall).toBeCloseTo(1 / 3, 10);
  });

  it("counts the page lines, the ones that touch a reference box, and the page-wide pass time", () => {
    const scored = scoreRealPair(identity, text, textless, textless, vision);
    expect(scored.lineBoxes).toHaveLength(4);
    expect(scored.lineCount).toBe(4);
    expect(scored.touchingLineCount).toBe(3);
    expect(scored.lineTouchShare).toBe(0.75);
    expect(scored.pageLineMs).toBe(12.5);
  });

  it("scores a page with no line as zero lines and no time", () => {
    const scored = scoreRealPair(identity, text, textless, textless, { regions: [], uncovered: [], timingsMs: {} });
    expect(scored).toMatchObject({ lineCount: 0, touchingLineCount: 0, lineTouchShare: 0, pageLineMs: 0, lineRecall: 0, detectionRecall: 0 });
  });

  it("derives the order rule from the ordinals", () => {
    expect(scoreRealPair(identity, text, textless, textless, vision).orderAgrees).toBe(true);
    expect(scoreRealPair({ ...identity, textOrdinal: 5, textlessOrdinal: 3 }, text, textless, textless, vision).orderAgrees).toBe(false);
  });
});

describe("translation policy against the textless page", () => {
  const { text, textless } = pageWithThreeSquares();
  const withPolicy = (box: Box, policy: "translate" | "keep", clean: "flat" | "none" | "kept") => ({
    ...regionWith(box, []),
    classification: policy === "keep"
      ? { layout: "text_free" as const, kind: "sfx" as const, policy }
      : { layout: "text_free" as const, kind: "free_text" as const, policy },
    clean,
  });
  /** Squares at x 0, 200 and 400 are text the textless page removed; the rest of the page is art it kept. */
  const vision: Pick<PageVisionResult, "regions" | "uncovered" | "timingsMs"> = {
    regions: [
      withPolicy({ x0: 0, y0: 0, x1: 100, y1: 100 }, "translate", "flat"),
      withPolicy({ x0: 520, y0: 120, x1: 580, y1: 180 }, "translate", "none"),
      withPolicy({ x0: 400, y0: 0, x1: 500, y1: 100 }, "keep", "kept"),
      withPolicy({ x0: 250, y0: 150, x1: 300, y1: 190 }, "keep", "kept"),
    ],
    uncovered: [boxLine({ x0: 200, y0: 0, x1: 300, y1: 100 }), boxLine({ x0: 500, y0: 150, x1: 550, y1: 170 })],
    timingsMs: {},
  };

  it("counts translated art, translations without a mask, kept dialogue and dropped dialogue lines", () => {
    expect(scoreRealPair(identity, text, textless, textless, vision)).toMatchObject({
      translatedRegionCount: 2,
      translatedOffReference: 1,
      translatedUncleaned: 1,
      keptRegionCount: 2,
      keptOnReference: 1,
      uncoveredCount: 2,
      uncoveredOnReference: 1,
    });
  });

  it("adds the counts over the pairs and prints them", () => {
    const scored = scoreRealPair(identity, text, textless, textless, vision);
    const report = buildRealReport(
      { gpu: true, lines: "server", groundTruth: summarizeGroundTruth(2, [[1, 2]], []) },
      [scored, { ...scored, id: "p0003" }],
    );
    expect(report.summary).toMatchObject({ translatedRegionCount: 4, translatedOffReference: 2, keptOnReference: 2, uncoveredOnReference: 2 });
    const printed = formatRealSummaryZh(report);
    expect(printed).toContain("送译区域 4：落在无字差分外 2（艺术字或误检被翻）  没有擦字掩码 2");
    expect(printed).toContain("保留区域 4：落在无字差分内 2（对白被当成艺术字）");
    expect(printed).toContain("丢弃的行 4 条：落在无字差分内 2（可能漏翻）");
  });
});

describe("real eval report", () => {
  const { text, textless } = pageWithThreeSquares();
  const groundTruth = summarizeGroundTruth(9, [[1, 2], [3, 4, 5]], [
    {
      members: [{ ordinal: 1, readBoxCount: 3, readableBoxCount: 3 }, { ordinal: 2, readBoxCount: 3, readableBoxCount: 0 }],
      textlessOrdinal: 2,
      pairs: [{ textOrdinal: 1, textlessOrdinal: 2 }],
      excluded: [],
    },
    {
      members: [
        { ordinal: 3, readBoxCount: 2, readableBoxCount: 2 },
        { ordinal: 4, readBoxCount: 2, readableBoxCount: 2 },
        { ordinal: 5, readBoxCount: 2, readableBoxCount: 1 },
      ],
      textlessOrdinal: null,
      pairs: [],
      excluded: [{ reason: "no_textless_member", ordinals: [3, 4, 5], pairCount: 2 }],
    },
  ]);

  it("counts clusters, confirmed pairs and what each reason removed", () => {
    expect(groundTruth).toMatchObject({
      pageCount: 9,
      clusterCount: 2,
      clusteredPageCount: 5,
      checkedClusterCount: 2,
      confirmedPairCount: 1,
      excluded: {
        no_textless_member: { clusters: 1, members: 3, pairs: 2 },
        too_few_readable_boxes: { clusters: 0, members: 0, pairs: 0 },
      },
    });
    expect(groundTruth.clusters).toHaveLength(2);
  });

  it("pools the touching lines over all pairs and averages the page-wide pass time", () => {
    const vision = { regions: [], uncovered: [boxLine({ x0: 0, y0: 0, x1: 100, y1: 100 })], timingsMs: { page_lines: 10 } };
    const first = scoreRealPair(identity, text, textless, textless, vision);
    const second = { ...first, id: "p0002", lineCount: 9, touchingLineCount: 3, lineTouchShare: 1 / 3, pageLineMs: 30 };
    const report = buildRealReport({ gpu: false, lines: "server", groundTruth }, [first, second]);
    expect(report).toMatchObject({ gpu: false, lines: "server", pairCount: 2, orderDisagreements: 0 });
    expect(report.summary.lineCount).toBe(10);
    expect(report.summary.lineTouchShare).toBe(0.4);
    expect(report.summary.pageLineMs).toBe(20);
  });

  it("prints the model, the ground-truth counts and the line metrics", () => {
    const report = buildRealReport({ gpu: false, lines: "server", groundTruth }, []);
    const printed = formatRealSummaryZh(report);
    expect(printed).toContain("行检测模型 server");
    expect(printed).toContain("相似页簇 2（共 5 页，已核对 2 簇）  OCR 确认配对 1");
    expect(printed).toContain("簇内没有无字页 1 簇 3 页 2 对");
    expect(printed).toContain("可读框不足 0 页 0 对");
    expect(printed).toContain("区域加行召回");
    expect(printed).toContain("整页行检测均耗时 0 ms/页");
  });
});
