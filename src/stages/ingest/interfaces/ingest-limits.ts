/** Guards against archive bombs and runaway inputs; checked before any entry is inflated. */
export interface IngestLimits {
  maxEntries: number;
  maxTotalBytes: number;
  /** Largest allowed uncompressed / compressed size of a single entry. */
  maxCompressionRatio: number;
}
