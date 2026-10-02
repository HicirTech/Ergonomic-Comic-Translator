import { boxArea, boxHeight, boxWidth } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { RegionResult } from "../../src/pipeline/interfaces/index.ts";
import type { SyntheticPage } from "../synthetic/interfaces/index.ts";
import { paintedSurface } from "../synthetic/painted-surface.ts";
import type { DamageSplit, FalsePositiveRegion } from "./interfaces/index.ts";

const pixelInBox = (box: Box, x: number, y: number) =>
  x + 0.5 >= box.x0 && x + 0.5 < box.x1 && y + 0.5 >= box.y0 && y + 0.5 < box.y1;

const differs = (left: Uint8Array, right: Uint8Array, offset: number) =>
  left[offset] !== right[offset] || left[offset + 1] !== right[offset + 1] || left[offset + 2] !== right[offset + 2];

/**
 * Splits pixels that differ outside the dilated text mask. The difference is exact, the same test as
 * changesOutsideMask, so the three places sum to that count.
 */
export const attributeOutsideChanges = (
  original: Uint8Array,
  cleaned: Uint8Array,
  width: number,
  height: number,
  dilatedMask: Uint8Array,
  regions: readonly { box: Box; clean: FalsePositiveRegion["clean"]; matched: boolean }[],
): DamageSplit => {
  const split: DamageSplit = {
    changed: 0,
    insideMatched: 0,
    insideFalsePositive: 0,
    outsideRegions: 0,
    flat: 0,
    inpaint: 0,
    kept: 0,
    none: 0,
  };
  for (let index = 0; index < dilatedMask.length; index += 1) {
    if (dilatedMask[index]) continue;
    if (!differs(original, cleaned, index * 3)) continue;
    split.changed += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const matched = regions.find((region) => region.matched && pixelInBox(region.box, x, y));
    const holder = matched ?? regions.find((region) => pixelInBox(region.box, x, y));
    if (!holder) {
      split.outsideRegions += 1;
      continue;
    }
    if (holder.matched) split.insideMatched += 1;
    else split.insideFalsePositive += 1;
    split[holder.clean] += 1;
  }
  return split;
};

/** Predicted regions that no ground-truth block claimed under matchByCoverage. */
export const falsePositivesOf = (
  page: SyntheticPage,
  regions: readonly RegionResult[],
  claimed: ReadonlySet<number>,
): FalsePositiveRegion[] =>
  regions.flatMap((region, index) => {
    if (claimed.has(index)) return [];
    return [{
      cls: region.cls,
      classification: region.classification,
      clean: region.clean,
      width: boxWidth(region.box),
      height: boxHeight(region.box),
      area: boxArea(region.box),
      surface: paintedSurface(page, region.box),
    }];
  });
