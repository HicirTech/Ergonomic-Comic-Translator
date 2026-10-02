import type { Box } from "../../../src/geometry/interfaces/index.ts";
import type { CerGap } from "../../metrics/interfaces/index.ts";
import type { LayoutKind } from "../../synthetic/interfaces/index.ts";
import type { OcrBlockScore } from "./ocr-page-score.ts";
import type { OcrKindSummary } from "./ocr-kind-summary.ts";
import type { OcrLineRotation } from "./ocr-line-rotation.ts";
import type { OcrRemovalScore } from "./ocr-removal-score.ts";

/** Full per-item eval. The stdout table is a projection of `summary` and `checks` only. */
export interface OcrEvalReport {
  seed: number;
  pageCount: number;
  gpu: boolean;
  passed: boolean;
  checks: {
    verticalCer: boolean;
    lineRotation: boolean;
    sentenceRotation: boolean;
    writingMode: boolean;
    lineOrder: boolean;
  };
  thresholds: {
    verticalCerGapLimit: number;
    rotationBestShareMin: number;
    sentenceRotationBestShareMin: number;
    writingModeAccuracyMin: number;
    lineOrderAccuracyMin: number;
  };
  gaps: CerGap[];
  summary: {
    horizontalCer: number;
    verticalCer: number;
    worstVerticalGap: number | null;
    rotationBestShare: number;
    sentenceRotationBestShare: number;
    writingModeAccuracy: number;
    lineOrderAccuracy: number;
    detectionRecall: number;
    detectionPrecision: number;
    meanMaskedMae: number;
    meanChangesOutside: number;
    meanStrongResidual: number;
    byKind: Record<LayoutKind, OcrKindSummary>;
  };
  pages: {
    id: string;
    predictedBoxes: Box[];
    detectionRecall: number;
    detectionPrecision: number;
    removal: OcrRemovalScore;
    blocks: OcrBlockScore[];
    rotations: OcrLineRotation[];
  }[];
}
