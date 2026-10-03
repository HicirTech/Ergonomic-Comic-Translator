import type { CachedDifference } from "./cached-difference.ts";
import type { CachedReading } from "./cached-reading.ts";

/** One cluster's readings as stored in the cache, by content. */
export interface CachedCluster {
  members: CachedReading[];
  differences: CachedDifference[];
}
