/** How much of the page two members of a cluster differ in: the share of pixels in their difference areas. */
export interface PairDifference {
  /** Ordinals, first below second. */
  first: number;
  second: number;
  share: number;
}
