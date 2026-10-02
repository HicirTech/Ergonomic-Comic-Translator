/** How predicted regions claim one ground-truth block under the coverage rule. */
export interface CoverageMatch {
  referenceIndex: number;
  /** Claimants that cover at least half the block, highest IoU first. */
  predictedIndexes: number[];
  /** `merged`: one region also claims other blocks. `split`: more than one region. */
  matchType: "single" | "merged" | "split" | "missed";
  /** IoU of the first claimant, or 0 when nothing claimed the block. */
  iou: number;
}
