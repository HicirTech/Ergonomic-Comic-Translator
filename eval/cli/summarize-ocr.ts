import type { Box } from "../../src/geometry/interfaces/index.ts";
import { regionPrecision } from "../metrics/vision-metrics.ts";
import {
  cerGaps,
  lineOrderAccuracyMin,
  rotationBestShareMin,
  sentenceRotationBestShareMin,
  verticalCerGapLimit,
  verticalCerWithinLimit,
  writingModeAccuracyMin,
} from "../metrics/ocr-metrics.ts";
import type { LayoutKind } from "../synthetic/interfaces/index.ts";
import type { OcrEvalReport, OcrKindSummary } from "./interfaces/index.ts";

const layoutKindOrder: readonly LayoutKind[] = ["h-line", "h-block", "v-column", "v-block", "art-h", "art-v", "slant-h", "slant-v"];

type PageScore = OcrEvalReport["pages"][number];

const mean = (values: readonly number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

/** Skips blocks the pipeline did not assign one turn. No remaining value is null, not a fake zero. */
const meanPresent = (values: readonly (number | null)[]) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : mean(present);
};

const share = (hits: number, total: number) => (total === 0 ? 0 : hits / total);

const kindSummary = (pages: readonly PageScore[], kind: LayoutKind): OcrKindSummary => {
  const blocks = pages.flatMap((page) => page.blocks.filter((block) => block.kind === kind));
  const decided = blocks.filter((block) => block.matchType !== "missed");
  const ids = new Set(blocks.map((block) => block.blockId));
  const lines = pages.flatMap((page) => page.rotations.filter((line) => ids.has(line.blockId)));
  const ordered = blocks.filter((block) => block.lineOrderMatch !== null);
  const count = (matchType: (typeof blocks)[number]["matchType"]) => blocks.filter((block) => block.matchType === matchType).length;
  return {
    blocks: blocks.length,
    recall: share(decided.length, blocks.length),
    single: count("single"),
    merged: count("merged"),
    split: count("split"),
    missed: count("missed"),
    cer: mean(blocks.map((block) => block.cer)),
    writingModeAccuracy: decided.length === 0 ? null : share(decided.filter((block) => block.writingModeMatch).length, decided.length),
    lineOrderAccuracy: ordered.length === 0 ? null : share(ordered.filter((block) => block.lineOrderMatch).length, ordered.length),
    lineBestCer: lines.length === 0 ? null : mean(lines.map((line) => line.cerByTurn[line.bestTurn]!)),
    baberuProductCer: meanPresent(blocks.map((block) => block.baberuProductCer)),
    baberuBestCer: blocks.length === 0 ? null : mean(blocks.map((block) => block.baberuCerByTurn[block.baberuBestTurn]!)),
    mangaOcrProductCer: meanPresent(blocks.map((block) => block.mangaOcrProductCer)),
    mangaOcrBestCer: blocks.length === 0 ? null : mean(blocks.map((block) => block.mangaOcrCerByTurn[block.mangaOcrBestTurn]!)),
  };
};

const allBoxes = (pages: readonly PageScore[]) => {
  const blocks = pages.flatMap((page) => page.blocks);
  let predictions = 0;
  let predictionHits = 0;
  for (const page of pages) {
    const boxes: Box[] = page.blocks.map((block) => block.box);
    predictions += page.predictedBoxes.length;
    predictionHits += page.predictedBoxes.length === 0 ? 0 : regionPrecision(boxes, page.predictedBoxes) * page.predictedBoxes.length;
  }
  return {
    recall: share(blocks.filter((block) => block.matchType !== "missed").length, blocks.length),
    precision: predictions === 0 ? 1 : predictionHits / predictions,
  };
};

export const buildOcrReport = (seed: number, gpu: boolean, pages: readonly PageScore[]): OcrEvalReport => {
  const blocks = pages.flatMap((page) => page.blocks);
  const rotations = pages.flatMap((page) => page.rotations);
  const gaps = cerGaps(blocks);
  const worst = gaps.reduce<number | null>((max, gap) => {
    const difference = gap.verticalCer - gap.horizontalCer;
    return max === null || difference > max ? difference : max;
  }, null);
  const ordered = blocks.filter((block) => block.lineOrderMatch !== null);
  // A miss is not a writing-mode or rotation decision. No claimed block is not a pass.
  const decided = blocks.filter((block) => block.matchType !== "missed");
  const writingModeAccuracy = share(decided.filter((block) => block.writingModeMatch).length, decided.length);
  const sentenceRotationBestShare = share(decided.filter((block) => block.sentenceRotationMatch).length, decided.length);
  const checks = {
    verticalCer: verticalCerWithinLimit(gaps),
    lineRotation: rotations.length > 0 && share(rotations.filter((line) => line.chosenIsBest).length, rotations.length) >= rotationBestShareMin,
    sentenceRotation: decided.length > 0 && sentenceRotationBestShare >= sentenceRotationBestShareMin,
    writingMode: decided.length > 0 && writingModeAccuracy >= writingModeAccuracyMin,
    lineOrder: ordered.length > 0 && share(ordered.filter((block) => block.lineOrderMatch).length, ordered.length) >= lineOrderAccuracyMin,
  };
  const detection = allBoxes(pages);
  const byKind = Object.fromEntries(layoutKindOrder.map((kind) => [kind, kindSummary(pages, kind)])) as Record<LayoutKind, OcrKindSummary>;
  return {
    seed,
    pageCount: pages.length,
    gpu,
    passed: checks.verticalCer && checks.lineRotation && checks.sentenceRotation && checks.writingMode && checks.lineOrder,
    checks,
    thresholds: {
      verticalCerGapLimit,
      rotationBestShareMin,
      sentenceRotationBestShareMin,
      writingModeAccuracyMin,
      lineOrderAccuracyMin,
    },
    gaps,
    summary: {
      horizontalCer: mean(blocks.filter((block) => block.direction === "h").map((block) => block.cer)),
      verticalCer: mean(blocks.filter((block) => block.direction === "v").map((block) => block.cer)),
      worstVerticalGap: worst,
      rotationBestShare: share(rotations.filter((line) => line.chosenIsBest).length, rotations.length),
      sentenceRotationBestShare,
      writingModeAccuracy,
      lineOrderAccuracy: share(ordered.filter((block) => block.lineOrderMatch).length, ordered.length),
      detectionRecall: detection.recall,
      detectionPrecision: detection.precision,
      falsePositiveCount: pages.reduce((sum, page) => sum + page.falsePositives.length, 0),
      falsePositivesOnBubble: pages.reduce((sum, page) => sum + page.falsePositives.filter((region) => region.surface === "bubble").length, 0),
      falsePositivesOnTextureOrNoise: pages.reduce((sum, page) => sum + page.falsePositives.filter((region) => region.surface === "texture-or-noise").length, 0),
      falsePositivesOnPlainPaper: pages.reduce((sum, page) => sum + page.falsePositives.filter((region) => region.surface === "plain-paper").length, 0),
      meanDamageInsideMatched: mean(pages.map((page) => page.removal.damage.insideMatched)),
      meanDamageInsideFalsePositive: mean(pages.map((page) => page.removal.damage.insideFalsePositive)),
      meanDamageOutsideRegions: mean(pages.map((page) => page.removal.damage.outsideRegions)),
      meanDamageFlat: mean(pages.map((page) => page.removal.damage.flat)),
      meanDamageInpaint: mean(pages.map((page) => page.removal.damage.inpaint)),
      meanMaskedMae: mean(pages.map((page) => page.removal.maskedMae)),
      meanChangesOutside: mean(pages.map((page) => page.removal.changesOutsideDilatedMask)),
      meanStrongResidual: mean(pages.map((page) => page.removal.strongResidualShare)),
      sfxMarks: pages.reduce((sum, page) => sum + page.sfx.marks, 0),
      sfxAbsorbedLines: pages.reduce((sum, page) => sum + page.sfx.absorbedLines, 0),
      sfxTranslatedRegions: pages.reduce((sum, page) => sum + page.sfx.translatedRegions, 0),
      sfxKeptRegions: pages.reduce((sum, page) => sum + page.sfx.keptRegions, 0),
      sfxDamageShare: share(
        pages.reduce((sum, page) => sum + page.sfx.damagedPixels, 0),
        pages.reduce((sum, page) => sum + page.sfx.pixels, 0),
      ),
      byKind,
    },
    pages: pages.map((page) => page),
  };
};
