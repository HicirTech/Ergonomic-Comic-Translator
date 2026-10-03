/** DB post-processing thresholds; defaults from PP-OCRv5_server_det inference.yml. */
export interface DbParams {
  threshold: number;
  boxThreshold: number;
  unclipRatio: number;
  /** Lines whose short side is below this many map pixels are noise. */
  minShortSide: number;
  /** Pixel fill of the minimum-area rectangle below which a line counts as curved. */
  curvedFill: number;
}
