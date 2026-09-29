/** A page accepted into a volume: identity is the content hash plus the natural-order ordinal. */
export interface IngestedPage {
  ordinal: number;
  displayName: string;
  sha256: string;
  /** Content-addressed copy in the data directory. */
  storedPath: string;
  width: number;
  height: number;
}
