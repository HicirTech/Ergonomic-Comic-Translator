import type { RealGroundTruth } from "../../ground-truth/interfaces/index.ts";
import type { RealPairScore } from "./real-pair-score.ts";

/** Aggregates for one real-volume run. A finished run is recorded, not judged. */
export interface RealEvalReport {
  gpu: boolean;
  /** How the textless pairs were found and confirmed, and what was left out. */
  groundTruth: RealGroundTruth;
  /** Confirmed pairs that were scored. */
  pairCount: number;
  /** Pairs where the later page was the one with text. Measures the order rule in classifyPages. */
  orderDisagreements: number;
  summary: {
    /** Recall of the reference boxes by regions alone, by regions with uncovered lines, and by lines alone. */
    detectionRecall: number;
    strokeRecall: number;
    regionLineRecall: number;
    lineRecall: number;
    /** All page lines of all scored pairs. */
    lineCount: number;
    /** Share of those lines that overlap a reference box, over all pairs together. */
    lineTouchShare: number;
    /** Mean time of the whole-page line pass per page, in milliseconds. */
    pageLineMs: number;
    detectionPrecision: number;
    detectionPrecisionExcludingKeep: number;
    missedCount: number;
    missedAreaShare: number;
    /** Totals over all pairs; see RealPairScore for each count. */
    translatedRegionCount: number;
    translatedOffReference: number;
    translatedUncleaned: number;
    keptRegionCount: number;
    keptOnReference: number;
    uncoveredCount: number;
    uncoveredOnReference: number;
    damageCount: number;
    damageShare: number;
    damageInsideRegion: number;
    damageOutsideRegion: number;
    residualStrokeShare: number;
  };
  pairs: RealPairScore[];
}
