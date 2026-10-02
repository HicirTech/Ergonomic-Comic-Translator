import type { RealPairScore } from "./real-pair-score.ts";

/** Aggregates for one real-volume run. A finished run is recorded, not judged. */
export interface RealEvalReport {
  gpu: boolean;
  pairCount: number;
  /** Pairs where the later page was the one with text. Measures the order rule in classifyPages. */
  orderDisagreements: number;
  summary: {
    detectionRecall: number;
    detectionPrecision: number;
    detectionPrecisionExcludingKeep: number;
    missedCount: number;
    missedAreaShare: number;
    damageCount: number;
    damageShare: number;
    damageInsideRegion: number;
    damageOutsideRegion: number;
    residualStrokeShare: number;
  };
  pairs: RealPairScore[];
}
