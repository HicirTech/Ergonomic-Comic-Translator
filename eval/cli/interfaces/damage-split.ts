/**
 * Changed pixels outside the dilated text mask, partitioned once.
 * A pixel inside both a matched region and a false positive counts as matched.
 * flat and inpaint are the clean strategy of that chosen region.
 */
export interface DamageSplit {
  changed: number;
  insideMatched: number;
  insideFalsePositive: number;
  outsideRegions: number;
  flat: number;
  inpaint: number;
  kept: number;
  none: number;
}
