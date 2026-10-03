import type { ExclusionReason } from "./exclusion-reason.ts";

/** The text pages one reason removed from a cluster, and the candidate pairs that went with them. */
export interface ClusterExclusion {
  reason: ExclusionReason;
  ordinals: number[];
  /** Every text page is one candidate pair, with the closest textless page. */
  pairCount: number;
}
