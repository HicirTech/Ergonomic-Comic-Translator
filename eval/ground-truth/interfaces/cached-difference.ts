/** A pair difference as stored in the cache: by content, since ordinals change between ingests. */
export interface CachedDifference {
  first: string;
  second: string;
  share: number;
}
