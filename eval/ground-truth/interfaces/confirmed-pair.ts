/** A text page and the textless page with the same picture, by ordinal. */
export interface ConfirmedPair {
  textOrdinal: number;
  textlessOrdinal: number;
  /** Share of the page in which the two differ: the text, and whatever else the variants change. */
  differenceShare: number;
}
