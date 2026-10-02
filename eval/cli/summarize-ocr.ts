import type { Box } from "../../src/geometry/interfaces/index.ts";
import { regionPrecision, regionRecall } from "../metrics/vision-metrics.ts";
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
  let references = 0;
  let referenceHits = 0;
  for (const page of pages) {
    const boxes = page.blocks.filter((block) => block.kind === kind).map((block) => block.box);
    if (boxes.length === 0) continue;
    references += boxes.length;
    referenceHits += regionRecall(boxes, page.predictedBoxes) * boxes.length;
  }
  const ids = new Set(blocks.map((block) => block.blockId));
  const lines = pages.flatMap((page) => page.rotations.filter((line) => ids.has(line.blockId)));
  const ordered = blocks.filter((block) => block.lineOrderMatch !== null);
  return {
    blocks: blocks.length,
    recall: share(referenceHits, references),
    cer: mean(blocks.map((block) => block.cer)),
    writingModeAccuracy: share(blocks.filter((block) => block.writingModeMatch).length, blocks.length),
    lineOrderAccuracy: ordered.length === 0 ? null : share(ordered.filter((block) => block.lineOrderMatch).length, ordered.length),
    lineBestCer: lines.length === 0 ? null : mean(lines.map((line) => line.cerByTurn[line.bestTurn]!)),
    baberuProductCer: meanPresent(blocks.map((block) => block.baberuProductCer)),
    baberuBestCer: blocks.length === 0 ? null : mean(blocks.map((block) => block.baberuCerByTurn[block.baberuBestTurn]!)),
    mangaOcrProductCer: meanPresent(blocks.map((block) => block.mangaOcrProductCer)),
    mangaOcrBestCer: blocks.length === 0 ? null : mean(blocks.map((block) => block.mangaOcrCerByTurn[block.mangaOcrBestTurn]!)),
  };
};

const allBoxes = (pages: readonly PageScore[]) => {
  let references = 0;
  let referenceHits = 0;
  let predictions = 0;
  let predictionHits = 0;
  for (const page of pages) {
    const boxes: Box[] = page.blocks.map((block) => block.box);
    references += boxes.length;
    referenceHits += boxes.length === 0 ? 0 : regionRecall(boxes, page.predictedBoxes) * boxes.length;
    predictions += page.predictedBoxes.length;
    predictionHits += page.predictedBoxes.length === 0 ? 0 : regionPrecision(boxes, page.predictedBoxes) * page.predictedBoxes.length;
  }
  return {
    recall: share(referenceHits, references),
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
  // Missed blocks and disagreeing utterances count against both shares. No blocks is not a pass.
  const writingModeAccuracy = share(blocks.filter((block) => block.writingModeMatch).length, blocks.length);
  const sentenceRotationBestShare = share(blocks.filter((block) => block.sentenceRotationMatch).length, blocks.length);
  const checks = {
    verticalCer: verticalCerWithinLimit(gaps),
    lineRotation: rotations.length > 0 && share(rotations.filter((line) => line.chosenIsBest).length, rotations.length) >= rotationBestShareMin,
    sentenceRotation: blocks.length > 0 && sentenceRotationBestShare >= sentenceRotationBestShareMin,
    writingMode: blocks.length > 0 && writingModeAccuracy >= writingModeAccuracyMin,
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
      meanMaskedMae: mean(pages.map((page) => page.removal.maskedMae)),
      meanChangesOutside: mean(pages.map((page) => page.removal.changesOutsideDilatedMask)),
      meanStrongResidual: mean(pages.map((page) => page.removal.strongResidualShare)),
      byKind,
    },
    pages: pages.map((page) => page),
  };
};
