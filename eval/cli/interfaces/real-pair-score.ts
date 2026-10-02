import type { Box } from "../../../src/geometry/interfaces/index.ts";

/** One text page measured against its textless partner. Numbers and ids only. */
export interface RealPairScore {
  id: string;
  textOrdinal: number;
  textlessOrdinal: number;
  textSha256: string;
  textlessSha256: string;
  /** True when the later page is the textless one, which is the product's pairing rule. */
  orderAgrees: boolean;
  width: number;
  height: number;
  referenceBoxes: Box[];
  predictedBoxes: Box[];
  detectionRecall: number;
  detectionPrecision: number;
  /** Precision after dropping regions whose policy is keep (SFX may remain in the textless page). */
  detectionPrecisionExcludingKeep: number;
  missedCount: number;
  /** Area of missed reference boxes over the area of every reference box. */
  missedAreaShare: number;
  damageCount: number;
  damageShare: number;
  damageInsideRegion: number;
  damageOutsideRegion: number;
  strokePixels: number;
  /** Share of stroke pixels whose cleaned colour is still within damageLevel of the original. */
  residualStrokeShare: number;
}
