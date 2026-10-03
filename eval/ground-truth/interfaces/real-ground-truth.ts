import type { ExclusionReason } from "./exclusion-reason.ts";
import type { TextlessConfirmation } from "./textless-confirmation.ts";

/** How the real-page ground truth was built. Counts and ordinals only. */
export interface RealGroundTruth {
  /** Pages ingested. */
  pageCount: number;
  /** Groups of two or more near-identical pages: same size, close dHash, a changed share inside the pair window. */
  clusterCount: number;
  /** Pages in those groups. */
  clusteredPageCount: number;
  /** Clusters whose pages were read. Fewer than clusterCount only when --pages ended the run early. */
  checkedClusterCount: number;
  /** Text and textless page pairs that passed the OCR check, in the clusters that were read. */
  confirmedPairCount: number;
  /** What each reason removed over the clusters that were read: clusters it touched, pages, candidate pairs. */
  excluded: Record<ExclusionReason, { clusters: number; members: number; pairs: number }>;
  /** One entry per cluster that was read, so each decision can be audited. */
  clusters: TextlessConfirmation[];
}
