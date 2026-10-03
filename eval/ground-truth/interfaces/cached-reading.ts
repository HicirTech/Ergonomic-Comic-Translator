/** One member's reading as stored in the cache: by content, since ordinals change between ingests. */
export interface CachedReading {
  sha256: string;
  readBoxCount: number;
  readableBoxCount: number;
}
