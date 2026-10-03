import { boxArea, boxCenter, boxHeight, boxWidth } from "../../src/geometry/box.ts";
import type { Box, Point } from "../../src/geometry/interfaces/index.ts";
import { rasterizeConvexQuad } from "../../src/geometry/raster.ts";
import type { RegionResult } from "../../src/pipeline/interfaces/index.ts";
import type { SyntheticPage } from "../synthetic/interfaces/index.ts";
import { paintedSurface } from "../synthetic/painted-surface.ts";
import type { DamageSplit, FalsePositiveRegion, OcrSfxScore } from "./interfaces/index.ts";

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
    membrane: 0,
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

/**
 * The art lettering of a page against the pipeline's regions and the cleaned page. Lettering is part of the
 * clean background, so any changed pixel inside its box is damage; a line of a claimed region centred on it
 * was read and erased with the dialogue; an unclaimed region centred on it is lettering taken for text.
 */
export const sfxScoreOf = (
  page: SyntheticPage,
  regions: readonly RegionResult[],
  claimed: ReadonlySet<number>,
  background: Uint8Array,
  cleaned: Uint8Array,
): OcrSfxScore => {
  if (page.sfx.length === 0) return { marks: 0, absorbedLines: 0, translatedRegions: 0, keptRegions: 0, damagedPixels: 0, pixels: 0 };
  const lettering = new Uint8Array(page.width * page.height);
  for (const mark of page.sfx) rasterizeConvexQuad(lettering, page.width, page.height, mark.polygon);
  const onLettering = (point: Point) => {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    return x >= 0 && y >= 0 && x < page.width && y < page.height && lettering[y * page.width + x] === 1;
  };
  let pixels = 0;
  let damagedPixels = 0;
  for (let index = 0; index < lettering.length; index += 1) {
    if (!lettering[index]) continue;
    pixels += 1;
    if (differs(background, cleaned, index * 3)) damagedPixels += 1;
  }
  const taken = regions.filter((region, index) => !claimed.has(index) && onLettering(boxCenter(region.box)));
  return {
    marks: page.sfx.length,
    absorbedLines: regions.reduce((sum, region, index) =>
      sum + (claimed.has(index) ? region.lines.filter((line) => onLettering(line.rect.center)).length : 0), 0),
    translatedRegions: taken.filter((region) => region.classification.policy !== "keep").length,
    keptRegions: taken.filter((region) => region.classification.policy === "keep").length,
    damagedPixels,
    pixels,
  };
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
