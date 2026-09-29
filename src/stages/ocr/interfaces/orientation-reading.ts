/** textline-ori result for one rotation of a crop. */
export interface OrientationReading {
  quarterTurns: number;
  /** Probability that the upright-looking crop is actually upside down. */
  upsideDown: number;
}
