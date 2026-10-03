import { describe, expect, it } from "bun:test";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import type { PageVisionResult, VisionClient } from "../../src/pipeline/interfaces/index.ts";
import type { TextLine } from "../../src/stages/lines/interfaces/index.ts";
import { utteranceCrop } from "../../src/stages/ocr/ocr-plan.ts";
import { scoreSyntheticPage } from "../../eval/cli/score-page.ts";
import { plannedSearchReads, readPlannedSearches } from "../../eval/cli/search-reads.ts";
import { defaultPageCount, defaultSeed, parseOcrEvalArgs } from "../../eval/cli/parse-ocr-eval-options.ts";
import { formatSummaryZh } from "../../eval/cli/format-summary-zh.ts";
import { buildOcrReport } from "../../eval/cli/summarize-ocr.ts";
import type { OcrBlockScore, OcrEvalReport, OcrKindSummary, OcrLineRotation } from "../../eval/cli/interfaces/index.ts";
import type { GroundTruthBlock, SyntheticPage } from "../../eval/synthetic/interfaces/index.ts";
import {
  lineOrderAccuracyMin,
  rotationBestShareMin,
  sentenceRotationBestShareMin,
  verticalCerGapLimit,
  writingModeAccuracyMin,
} from "../../eval/metrics/ocr-metrics.ts";

/** Scores of a page without art lettering. */
const noSfx = { marks: 0, absorbedLines: 0, translatedRegions: 0, keptRegions: 0, damagedPixels: 0, pixels: 0 };

describe("ocr eval options", () => {
  it("keeps a positional when no option is present", () => {
    const parsed = parseOcrEvalArgs(["page.png"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options.positionals).toEqual(["page.png"]);
    expect(parsed.options.out).toBeNull();
    expect(parsed.options.seed).toBe(defaultSeed);
    expect(parsed.options.pages).toBe(defaultPageCount);
    expect(parsed.options.gpu).toBe(false);
  });

  it("does not treat the value of a present option as a positional", () => {
    const parsed = parseOcrEvalArgs(["--seed", "4", "kept.png", "--pages", "2", "--out", "D:\\eval-out", "--gpu"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toEqual({
      out: "D:\\eval-out",
      seed: 4,
      pages: 2,
      gpu: true,
      positionals: ["kept.png"],
    });
  });

  it("rejects a missing value, zero pages and an unknown flag", () => {
    expect(parseOcrEvalArgs(["--pages"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--seed"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--pages", "--gpu"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--lines", "server"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--pages", "0"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--seed", "-1"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--gpu", "--pages"]).ok).toBe(false);
    expect(parseOcrEvalArgs(["--device", "cpu"]).ok).toBe(false);
    const seed = parseOcrEvalArgs(["--seed", "0"]);
    expect(seed.ok).toBe(true);
    if (seed.ok) expect(seed.options.seed).toBe(0);
  });
});

describe("ocr eval summary", () => {
  const emptyKind: OcrKindSummary = {
    blocks: 0,
    recall: 0,
    single: 0,
    merged: 0,
    split: 0,
    missed: 0,
    cer: 0,
    writingModeAccuracy: null,
    lineOrderAccuracy: null,
    lineBestCer: null,
    baberuProductCer: null,
    baberuBestCer: null,
    mangaOcrProductCer: null,
    mangaOcrBestCer: null,
  };
  const report = (): OcrEvalReport => ({
    seed: 1,
    pageCount: 0,
    gpu: false,
    passed: false,
    checks: { verticalCer: false, lineRotation: false, sentenceRotation: false, writingMode: false, lineOrder: false },
    thresholds: {
      verticalCerGapLimit,
      rotationBestShareMin,
      sentenceRotationBestShareMin,
      writingModeAccuracyMin,
      lineOrderAccuracyMin,
    },
    gaps: [],
    summary: {
      horizontalCer: 0.1,
      verticalCer: 0.12,
      worstVerticalGap: 0.02,
      rotationBestShare: 0.5,
      sentenceRotationBestShare: 0.4,
      writingModeAccuracy: 0.4,
      lineOrderAccuracy: 0.3,
      detectionRecall: 0,
      detectionPrecision: 1,
      falsePositiveCount: 0,
      falsePositivesOnBubble: 0,
      falsePositivesOnTextureOrNoise: 0,
      falsePositivesOnPlainPaper: 0,
      meanDamageInsideMatched: 0,
      meanDamageInsideFalsePositive: 0,
      meanDamageOutsideRegions: 0,
      meanDamageMembrane: 0,
      meanDamageInpaint: 0,
      meanMaskedMae: 1.5,
      meanChangesOutside: 4,
      meanStrongResidual: 0.2,
      sfxMarks: 3,
      sfxAbsorbedLines: 2,
      sfxTranslatedRegions: 1,
      sfxKeptRegions: 0,
      sfxDamageShare: 0.25,
      byKind: {
        "h-line": { ...emptyKind, blocks: 1, cer: 0.1, baberuProductCer: 0.4, baberuBestCer: 0.1 },
        "h-block": emptyKind,
        "v-column": emptyKind,
        "v-block": emptyKind,
        "art-h": emptyKind,
        "art-v": emptyKind,
        "slant-h": emptyKind,
        "slant-v": emptyKind,
      },
    },
    pages: [],
  });

  const box = (x0: number): Box => ({ x0, y0: 0, x1: x0 + 10, y1: 10 });

  const hypotheses = ["", "", "", ""] as [string, string, string, string];

  const block = (over: Partial<OcrBlockScore> & Pick<OcrBlockScore, "blockId" | "kind" | "direction" | "box">): OcrBlockScore => ({
    sentenceKey: "same",
    matchType: "single",
    iou: 1,
    predictedDirection: over.direction,
    productEngine: "baberu",
    productQuarterTurns: 0,
    writingModeMatch: true,
    sentenceRotationMatch: true,
    reference: "same",
    predicted: "same",
    cer: 0,
    lineOrderMatch: null,
    classification: null,
    pipelineUtterances: [],
    searchCandidates: null,
    baberuHypotheses: hypotheses,
    baberuCerByTurn: [0, 1, 1, 1],
    baberuBestTurn: 0,
    baberuProductCer: 0,
    mangaOcrHypotheses: hypotheses,
    mangaOcrCerByTurn: [0, 1, 1, 1],
    mangaOcrBestTurn: 0,
    mangaOcrProductCer: 0,
    ...over,
  });

  const line = (blockId: string, cerByTurn: [number, number, number, number], bestTurn: number, chosenIsBest: boolean): OcrLineRotation => ({
    blockId,
    lineOrder: 0,
    reference: "same",
    hypotheses,
    cerByTurn,
    bestTurn,
    chosenTurn: 0,
    chosenIsBest,
  });

  it("prints metrics and no ground-truth sentence", () => {
    const text = formatSummaryZh(report());
    expect(text).toContain("横排单行");
    expect(text).toContain("未通过");
    expect(text).toContain("Baberu产品CER");
    expect(text).toContain("句子所选旋转");
    expect(text).not.toContain("今日は良い天気です");
    expect(text).not.toContain("The cat waits");
    expect(text.split("\n")[1]).not.toContain("精度");
  });

  it("passes only when every threshold has evidence", () => {
    const failed = buildOcrReport(1, false, []);
    expect(failed.passed).toBe(false);
    expect(failed.checks.verticalCer).toBe(false);
    expect(failed.checks.lineRotation).toBe(false);
    expect(failed.checks.sentenceRotation).toBe(false);
    expect(failed.checks.writingMode).toBe(false);
    expect(failed.checks.lineOrder).toBe(false);
  });

  it("aggregates reader turns per kind and keeps precision only for the whole set", () => {
    const horizontal = box(0);
    const vertical = box(30);
    const scored = buildOcrReport(1, false, [{
      id: "p0",
      predictedBoxes: [horizontal, vertical],
      detectionRecall: 0,
      detectionPrecision: 0,
      removal: { maskedMae: 1, changesOutsideDilatedMask: 2, strongResidualShare: 0, damage: { changed: 2, insideMatched: 0, insideFalsePositive: 0, outsideRegions: 2, membrane: 0, inpaint: 0, kept: 0, none: 0 } },
      falsePositives: [],
      sfx: noSfx,
      blocks: [
        block({
          blockId: "h",
          kind: "h-line",
          direction: "h",
          box: horizontal,
          cer: 0.2,
          baberuCerByTurn: [0.4, 0.1, 0.5, 0.6],
          baberuBestTurn: 1,
          baberuProductCer: 0.4,
          mangaOcrCerByTurn: [0.25, 0.25, 0.8, 0.9],
          mangaOcrBestTurn: 0,
          mangaOcrProductCer: 0.25,
          productEngine: "manga-ocr",
        }),
        block({
          blockId: "v",
          kind: "v-column",
          direction: "v",
          box: vertical,
          cer: 0.5,
          predictedDirection: "h",
          writingModeMatch: false,
          sentenceRotationMatch: false,
          productEngine: null,
          productQuarterTurns: null,
          baberuCerByTurn: [0.2, 0.8, 0.8, 0.8],
          baberuBestTurn: 0,
          baberuProductCer: null,
          mangaOcrCerByTurn: [0.6, 0.6, 0.1, 0.7],
          mangaOcrBestTurn: 2,
          mangaOcrProductCer: null,
          lineOrderMatch: true,
        }),
      ],
      rotations: [
        line("h", [0.3, 0.05, 0.2, 0.4], 1, false),
        line("v", [0, 0.2, 0.2, 0.2], 0, true),
      ],
    }]);
    expect(scored.summary.byKind["h-line"]).toEqual({
      blocks: 1,
      recall: 1,
      single: 1,
      merged: 0,
      split: 0,
      missed: 0,
      cer: 0.2,
      writingModeAccuracy: 1,
      lineOrderAccuracy: null,
      lineBestCer: 0.05,
      baberuProductCer: 0.4,
      baberuBestCer: 0.1,
      mangaOcrProductCer: 0.25,
      mangaOcrBestCer: 0.25,
    });
    expect(scored.summary.byKind["v-column"]).toMatchObject({
      blocks: 1,
      recall: 1,
      single: 1,
      merged: 0,
      split: 0,
      missed: 0,
      cer: 0.5,
      writingModeAccuracy: 0,
      lineOrderAccuracy: 1,
      lineBestCer: 0,
      baberuProductCer: null,
      baberuBestCer: 0.2,
      mangaOcrProductCer: null,
      mangaOcrBestCer: 0.1,
    });
    expect(scored.summary.byKind["h-line"]).not.toHaveProperty("precision");
    expect(scored.summary.detectionPrecision).toBe(1);
    expect(scored.summary.writingModeAccuracy).toBe(0.5);
    expect(scored.summary.sentenceRotationBestShare).toBe(0.5);
    expect(scored.summary.rotationBestShare).toBe(0.5);
    expect(scored.checks.verticalCer).toBe(false);
    expect(scored.checks.sentenceRotation).toBe(false);
    expect(scored.checks.writingMode).toBe(false);
    expect(scored.checks.lineRotation).toBe(false);
    expect(scored.passed).toBe(false);
    const text = formatSummaryZh(scored);
    expect(text).toContain("0.400");
    expect(text).toContain("0.050");
    expect(text).not.toContain("same");

    const clear = buildOcrReport(1, false, [{
      id: "p1",
      predictedBoxes: [horizontal, vertical],
      detectionRecall: 1,
      detectionPrecision: 1,
      removal: { maskedMae: 0, changesOutsideDilatedMask: 0, strongResidualShare: 0, damage: { changed: 0, insideMatched: 0, insideFalsePositive: 0, outsideRegions: 0, membrane: 0, inpaint: 0, kept: 0, none: 0 } },
      falsePositives: [],
      sfx: noSfx,
      blocks: [
        block({ blockId: "h", kind: "h-line", direction: "h", box: horizontal, lineOrderMatch: true }),
        block({ blockId: "v", kind: "v-column", direction: "v", box: vertical }),
      ],
      rotations: [
        line("h", [0, 0.2, 0.2, 0.2], 0, true),
        line("v", [0, 0.2, 0.2, 0.2], 0, true),
      ],
    }]);
    expect(clear.checks).toEqual({
      verticalCer: true,
      lineRotation: true,
      sentenceRotation: true,
      writingMode: true,
      lineOrder: true,
    });
    expect(clear.passed).toBe(true);
    expect(clear.summary.byKind["h-line"].baberuProductCer).toBe(0);
    expect(clear.summary.byKind["h-line"].baberuBestCer).toBe(0);
  });

  it("leaves missed blocks out of writing mode and sentence rotation", () => {
    const found = box(0);
    const lost = box(40);
    const report = buildOcrReport(1, false, [{
      id: "p",
      predictedBoxes: [found],
      detectionRecall: 0,
      detectionPrecision: 0,
      removal: { maskedMae: 0, changesOutsideDilatedMask: 0, strongResidualShare: 0, damage: { changed: 0, insideMatched: 0, insideFalsePositive: 0, outsideRegions: 0, membrane: 0, inpaint: 0, kept: 0, none: 0 } },
      falsePositives: [],
      sfx: noSfx,
      blocks: [
        block({ blockId: "ok", kind: "v-column", direction: "v", box: found }),
        block({
          blockId: "miss",
          kind: "v-column",
          direction: "v",
          box: lost,
          matchType: "missed",
          writingModeMatch: false,
          sentenceRotationMatch: false,
          cer: 1,
          predicted: "",
        }),
      ],
      rotations: [line("ok", [0, 1, 1, 1], 0, true)],
    }]);
    expect(report.summary.detectionRecall).toBe(0.5);
    expect(report.summary.writingModeAccuracy).toBe(1);
    expect(report.summary.sentenceRotationBestShare).toBe(1);
    expect(report.summary.byKind["v-column"]).toMatchObject({ blocks: 2, recall: 0.5, single: 1, missed: 1, writingModeAccuracy: 1 });
    expect(formatSummaryZh(report)).toContain("未中");
  });
});

describe("ocr page score", () => {
  it("keeps utterance flags and the region class on the block, and out of the summary", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ] as GroundTruthBlock["polygon"];
    const block: GroundTruthBlock = {
      id: "p-b0",
      kind: "art-h",
      direction: "h",
      angle: 0,
      readingOrder: 0,
      sentenceKey: "猫",
      bubble: false,
      fontSize: 18,
      cx: 1,
      cy: 1,
      width: 2,
      height: 2,
      polygon,
      lines: [{ text: "猫", order: 0, polygon, cx: 1, cy: 1, width: 2, height: 2 }],
    };
    const page: SyntheticPage = {
      id: "p",
      seed: 1,
      index: 0,
      width: 2,
      height: 2,
      background: "dark",
      sfx: [],
      blocks: [block],
    };
    const image: RgbImage = { data: new Uint8Array(12), width: 2, height: 2 };
    const regionBox = { x0: 0, y0: 0, x1: 2, y1: 2 };
    const vision: PageVisionResult = {
      width: 2,
      height: 2,
      uncovered: [],
      cleanedPath: "",
      timingsMs: {},
      regions: [{
        box: regionBox,
        cls: null,
        bubble: null,
        lines: [],
        orientation: {
          tilt: 0,
          consistency: 1,
          writingMode: "h",
          ambiguous: false,
          frame: { cx: 1, cy: 1, w: 2, h: 2, angle: 0 },
        },
        classification: { layout: "text_free", kind: "sfx", policy: "keep" },
        clean: "kept",
        paper: null,
        ink: null,
        outline: null,
        utterances: [{
          box: regionBox,
          lineIndexes: [],
          startReasons: [],
          nameTag: false,
          thought: false,
          text: "猫",
          meanProb: 1,
          minProb: 1,
          engine: "baberu",
          textFrom: "sentence",
          quarterTurns: 2,
          flags: ["ORIENT_UNSURE"],
        }],
      }],
    };
    const scored = scoreSyntheticPage(page, vision, image, image, new Uint8Array(4), [[]], [[]], [[]], [[
      { quarterTurns: 0, text: "猫", meanProb: 0.4, minProb: 0.4, tokens: 1 },
      { quarterTurns: 1, text: "暗语只在报告", meanProb: 0.95, minProb: 0.9, tokens: 1 },
      { quarterTurns: 3, text: "猫狗", meanProb: 0.5, minProb: 0.5, tokens: 2 },
    ]]);
    expect(scored.blocks[0]?.matchType).toBe("single");
    expect(scored.blocks[0]?.classification).toEqual({ layout: "text_free", kind: "sfx", policy: "keep" });
    expect(scored.blocks[0]?.pipelineUtterances).toEqual([{ quarterTurns: 2, flags: ["ORIENT_UNSURE"] }]);
    // No lines: planQuarterTurns searches [0, 1, 3]. CER is against the block reference.
    expect(scored.blocks[0]?.searchCandidates).toEqual([
      { utteranceIndex: 0, quarterTurns: 0, meanProb: 0.4, cer: 0 },
      { utteranceIndex: 0, quarterTurns: 1, meanProb: 0.95, cer: 6 },
      { utteranceIndex: 0, quarterTurns: 3, meanProb: 0.5, cer: 1 },
    ]);
    const report = buildOcrReport(1, false, [scored]);
    expect(formatSummaryZh(report)).not.toContain("ORIENT_UNSURE");
    expect(formatSummaryZh(report)).not.toContain("猫");
    expect(formatSummaryZh(report)).not.toContain("暗语只在报告");
  });

  it("joins a split block in the product reading order and scores a miss as CER 1", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ] as GroundTruthBlock["polygon"];
    const textBlock = (id: string, text: string): GroundTruthBlock => ({
      id,
      kind: "v-column",
      direction: "v",
      angle: 0,
      readingOrder: 0,
      sentenceKey: text,
      bubble: false,
      fontSize: 18,
      cx: 5,
      cy: 15,
      width: 10,
      height: 30,
      polygon,
      lines: [{ text, order: 0, polygon, cx: 5, cy: 15, width: 10, height: 30 }],
    });
    const region = (box: Box, text: string, writingMode: "h" | "v"): PageVisionResult["regions"][number] => ({
      box,
      cls: null,
      bubble: null,
      lines: [],
      orientation: { tilt: 0, consistency: 1, writingMode, ambiguous: false, frame: { cx: 0, cy: 0, w: 1, h: 1, angle: 0 } },
      classification: { layout: "text_free", kind: "free_text", policy: "translate" },
      clean: "membrane",
      paper: null,
      ink: null,
      outline: null,
      utterances: [{
        box,
        lineIndexes: [],
        startReasons: [],
        nameTag: false,
        thought: false,
        text,
        meanProb: 1,
        minProb: 1,
        engine: "baberu",
        textFrom: "sentence",
        quarterTurns: 0,
        flags: [],
      }],
    });
    const image: RgbImage = { data: new Uint8Array(3), width: 1, height: 1 };
    const pageOf = (blocks: GroundTruthBlock[]): SyntheticPage => ({
      id: "p",
      seed: 1,
      index: 0,
      width: 10,
      height: 30,
      background: "paper",
      sfx: [],
      blocks,
    });
    const split = scoreSyntheticPage(
      pageOf([textBlock("split", "上下")]),
      {
        width: 10,
        height: 30,
        uncovered: [],
        cleanedPath: "",
        timingsMs: {},
        regions: [
          region({ x0: 0, y0: 14, x1: 10, y1: 30 }, "下", "v"),
          region({ x0: 0, y0: 0, x1: 10, y1: 16 }, "上", "v"),
        ],
      },
      image,
      image,
      new Uint8Array(1),
      [[]],
      [[]],
      [[]],
      [[], []],
    );
    expect(split.blocks[0]?.matchType).toBe("split");
    expect(split.blocks[0]?.predicted).toBe("上下");
    expect(split.blocks[0]?.pipelineUtterances.map((utterance) => utterance.quarterTurns)).toEqual([0, 0]);
    expect(split.detectionRecall).toBe(1);

    const missed = scoreSyntheticPage(
      pageOf([textBlock("miss", "猫")]),
      { width: 10, height: 30, uncovered: [], cleanedPath: "", timingsMs: {}, regions: [] },
      image,
      image,
      new Uint8Array(1),
      [[]],
      [[]],
      [[]],
      [],
    );
    expect(missed.blocks[0]).toMatchObject({ matchType: "missed", cer: 1, predicted: "", writingModeMatch: false, sentenceRotationMatch: false, searchCandidates: null });
    expect(missed.detectionRecall).toBe(0);
  });
});

const oneLine = [{ } as TextLine];

describe("planned search reads", () => {
  const region = (tilt: number, lines: TextLine[]): PageVisionResult["regions"][number] => ({
    box: { x0: 0, y0: 0, x1: 40, y1: 16 },
    cls: null,
    bubble: null,
    lines,
    orientation: {
      tilt,
      consistency: 1,
      writingMode: "h",
      ambiguous: false,
      frame: { cx: 20, cy: 8, w: 40, h: 16, angle: tilt },
    },
    classification: { layout: "text_free", kind: "free_text", policy: "translate" },
    clean: "membrane",
    paper: null,
    ink: null,
    outline: null,
    utterances: [{
      box: { x0: 2, y0: 2, x1: 38, y1: 14 },
      lineIndexes: [0],
      startReasons: [],
      nameTag: false,
      thought: false,
      text: "plain",
      meanProb: 0.9,
      minProb: 0.8,
      engine: "baberu",
      textFrom: "sentence",
      quarterTurns: 0,
      flags: [],
    }],
  });

  it("rebuilds the pipeline crop only when planQuarterTurns searches more than one turn", () => {
    const clear = region(3, oneLine);
    const slanted = region(30, oneLine);
    const gt = [{ x0: 0, y0: 0, x1: 40, y1: 16 }];
    expect(plannedSearchReads(gt, [clear])).toEqual([]);
    const [planned] = plannedSearchReads(gt, [slanted]);
    const turns = [0, 1, 3];
    expect(planned).toMatchObject({ blockIndex: 0, utteranceIndex: 0, engine: "baberu" });
    expect(planned!.crop).toEqual(utteranceCrop(slanted.orientation.frame, slanted.utterances[0]!.box, turns));
  });

  it("reads each planned crop with the engine the pipeline used", async () => {
    const gt = [{ x0: 0, y0: 0, x1: 40, y1: 16 }];
    const baberu = region(30, oneLine);
    const manga = region(30, oneLine);
    manga.utterances[0]!.engine = "manga-ocr";
    const plan = plannedSearchReads(gt, [baberu, manga]);
    const client = {
      readUtterances: async (_path: string, crops: { quarterTurns: number[] }[], engine: string) =>
        crops.map((crop) => crop.quarterTurns.map((quarterTurns) => ({
          quarterTurns,
          text: engine,
          meanProb: engine === "baberu" ? 0.7 : 0.3,
          minProb: 0.2,
          tokens: 1,
        }))),
    } as unknown as VisionClient;
    const reads = await readPlannedSearches(client, "page.png", plan);
    expect(reads.map((candidates) => candidates.map((candidate) => candidate.text))).toEqual([
      ["baberu", "baberu", "baberu"],
      ["manga-ocr", "manga-ocr", "manga-ocr"],
    ]);
  });
});
