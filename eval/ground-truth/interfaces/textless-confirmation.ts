import type { ClusterExclusion } from "./cluster-exclusion.ts";
import type { ConfirmedPair } from "./confirmed-pair.ts";
import type { MemberReading } from "./member-reading.ts";

/** The OCR check of one cluster. Ordinals and counts only: the text that was read is not kept. */
export interface TextlessConfirmation {
  /** Every member of the cluster, ascending by ordinal. */
  members: MemberReading[];
  /** The member with no readable box, or null when every member has readable text. */
  textlessOrdinal: number | null;
  pairs: ConfirmedPair[];
  excluded: ClusterExclusion[];
}
