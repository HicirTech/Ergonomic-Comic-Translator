import type { MemberReading } from "./member-reading.ts";
import type { PairDifference } from "./pair-difference.ts";

/** What readCluster measured on one cluster: each member's readings and how far apart every two members are. */
export interface ClusterReading {
  /** Ascending by ordinal. */
  members: MemberReading[];
  differences: PairDifference[];
}
