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
  /** Boxes of every line found on the page: the lines inside regions and the uncovered ones. */
  lineBoxes: Box[];
  /** Reference boxes at least half covered by the predicted regions alone: what the product does today. */
  detectionRecall: number;
  /** The same, covered by the predicted regions together with the uncovered lines. */
  regionLineRecall: number;
  /** The same, covered by the page lines alone. */
  lineRecall: number;
  lineCount: number;
  /** Page lines that overlap a reference box. */
  touchingLineCount: number;
  /** touchingLineCount over lineCount; 0 when the page has no line. */
  lineTouchShare: number;
  /** Time of the whole-page line pass in milliseconds (timingsMs.page_lines); 0 when it was not timed. */
  pageLineMs: number;
  detectionPrecision: number;
  /** Precision after dropping regions whose policy is keep (SFX may remain in the textless page). */
  detectionPrecisionExcludingKeep: number;
  missedCount: number;
  /** Area of missed reference boxes over the area of every reference box. */
  missedAreaShare: number;
  /** Regions whose policy is translate. */
  translatedRegionCount: number;
  /** Translated regions with under offReferenceShare of their box on the reference areas: art text or no text. */
  translatedOffReference: number;
  /** Translated regions that got no cleaning mask, so the source text stays under the translation. */
  translatedUncleaned: number;
  /** Regions whose policy is keep. */
  keptRegionCount: number;
  /** Kept regions with at least onReferenceShare of their box on the reference areas: dialogue taken for art. */
  keptOnReference: number;
  /** Lines outside every region, which the product drops. */
  uncoveredCount: number;
  /** Dropped lines with at least onReferenceShare of their box on the reference areas: dialogue left untranslated. */
  uncoveredOnReference: number;
  damageCount: number;
  damageShare: number;
  damageInsideRegion: number;
  damageOutsideRegion: number;
  strokePixels: number;
  /** Share of stroke pixels whose cleaned colour is still within damageLevel of the original. */
  residualStrokeShare: number;
}
