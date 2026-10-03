import type { ExclusionReason } from "./exclusion-reason.ts";

/** The pages one reason removed from a cluster, and the candidate pairs that went with them. */
export interface ClusterExclusion {
  reason: ExclusionReason;
  ordinals: number[];
  /** A cluster of k pages has k - 1 candidate pairs: every page but the textless one, paired with it. */
  pairCount: number;
}
