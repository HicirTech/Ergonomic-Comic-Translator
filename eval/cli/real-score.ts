import { boxArea } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import { rgbToGray } from "../../src/imaging/gray.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import { dilateSquare } from "../../src/imaging/morphology.ts";
import type { RegionResult } from "../../src/pipeline/interfaces/index.ts";
import { diffLevel, deriveTextAreas, median3x3 } from "../ground-truth/textless-diff.ts";
import { matchByCoverage } from "../metrics/ocr-metrics.ts";
import { regionPrecision, regionRecall } from "../metrics/vision-metrics.ts";
import type { RealEvalReport, RealPairScore } from "./interfaces/index.ts";

/** Pixels this far from the reference mask are still "outside" when counting damage. */
export const damageHaloRadiusPx = 4;
/** A cleaned pixel this far from the original text page, per channel, counts as damage or as removed. */
export const damageLevel = 24;

const mean = (values: readonly number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

const meanMaskedLuma = (image: RgbImage, mask: Uint8Array) => {
  const gray = rgbToGray(image);
  let sum = 0;
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    sum += gray.data[index]!;
    count += 1;
  }
  return count === 0 ? null : sum / count;
};

/**
 * Mask pixels where the text page is darker than the textless page by at least diffLevel.
 * Compared after the same 3x3 median deriveTextAreas uses, so compression specks are not strokes.
 */
export const textStrokeMask = (text: RgbImage, textless: RgbImage, areaMask: Uint8Array) => {
  const darker = rgbToGray(median3x3(text));
  const lighter = rgbToGray(median3x3(textless));
  const stroke = new Uint8Array(areaMask.length);
  for (let index = 0; index < areaMask.length; index += 1) {
    if (areaMask[index] && lighter.data[index]! - darker.data[index]! >= diffLevel) stroke[index] = 1;
  }
  return stroke;
};

/**
 * The text page is the darker image inside the pair difference. classifyPages instead calls the later
 * page the variant; `orderAgrees` is false when that rule picks the page that still has the ink.
 * The textless page is not a cleaning target: these variants remove the box or bubble with the text.
 */
export const orientTextlessPair = (earlier: RgbImage, later: RgbImage) => {
  const areas = deriveTextAreas(earlier, later);
  const earlierLuma = meanMaskedLuma(earlier, areas.mask);
  const laterLuma = meanMaskedLuma(later, areas.mask);
  const laterIsText = earlierLuma !== null && laterLuma !== null && laterLuma < earlierLuma;
  const text = laterIsText ? later : earlier;
  const textless = laterIsText ? earlier : later;
  return {
    text,
    textless,
    mask: areas.mask,
    boxes: areas.boxes,
    orderAgrees: !laterIsText,
    strokes: textStrokeMask(text, textless, areas.mask),
  };
};

const channelGap = (left: Uint8Array, right: Uint8Array, offset: number) => Math.max(
  Math.abs(left[offset]! - right[offset]!),
  Math.abs(left[offset + 1]! - right[offset + 1]!),
  Math.abs(left[offset + 2]! - right[offset + 2]!),
);

const pixelInBox = (box: Box, x: number, y: number) =>
  x + 0.5 >= box.x0 && x + 0.5 < box.x1 && y + 0.5 >= box.y0 && y + 0.5 < box.y1;

/** Damage against the original text page, outside the reference mask grown by damageHaloRadiusPx. */
export const damageAgainstOriginal = (
  original: RgbImage,
  cleaned: RgbImage,
  areaMask: Uint8Array,
  regions: readonly Box[],
) => {
  if (original.width !== cleaned.width || original.height !== cleaned.height || areaMask.length !== original.width * original.height) {
    throw new Error(`Cleaned page is ${cleaned.width}x${cleaned.height}, text page is ${original.width}x${original.height}`);
  }
  const dilated = dilateSquare(areaMask, original.width, original.height, damageHaloRadiusPx);
  let damageCount = 0;
  let damageInsideRegion = 0;
  for (let index = 0; index < dilated.length; index += 1) {
    if (dilated[index]) continue;
    if (channelGap(cleaned.data, original.data, index * 3) <= damageLevel) continue;
    damageCount += 1;
    const x = index % original.width;
    const y = Math.floor(index / original.width);
    if (regions.some((box) => pixelInBox(box, x, y))) damageInsideRegion += 1;
  }
  const pagePixels = original.width * original.height;
  return {
    damageCount,
    damageShare: pagePixels === 0 ? 0 : damageCount / pagePixels,
    damageInsideRegion,
    damageOutsideRegion: damageCount - damageInsideRegion,
  };
};

/** Share of stroke pixels still within damageLevel of the original: the ink was not removed. */
export const residualStrokeShare = (original: RgbImage, cleaned: RgbImage, strokes: Uint8Array) => {
  let text = 0;
  let remaining = 0;
  for (let index = 0; index < strokes.length; index += 1) {
    if (!strokes[index]) continue;
    text += 1;
    if (channelGap(cleaned.data, original.data, index * 3) <= damageLevel) remaining += 1;
  }
  return { strokePixels: text, residualStrokeShare: text === 0 ? 0 : remaining / text };
};

export const scoreRealPair = (
  identity: Pick<RealPairScore, "id" | "textOrdinal" | "textlessOrdinal" | "textSha256" | "textlessSha256" | "orderAgrees">,
  text: RgbImage,
  cleaned: RgbImage,
  areas: { mask: Uint8Array; boxes: Box[] },
  strokes: Uint8Array,
  regions: readonly RegionResult[],
): RealPairScore => {
  const predicted = regions.map((region) => region.box);
  const translating = regions.filter((region) => region.classification.policy !== "keep").map((region) => region.box);
  const matches = matchByCoverage(areas.boxes, predicted);
  const missed = areas.boxes.filter((_box, index) => matches[index]!.matchType === "missed");
  const referenceArea = areas.boxes.reduce((sum, box) => sum + boxArea(box), 0);
  const damage = damageAgainstOriginal(text, cleaned, areas.mask, predicted);
  const residual = residualStrokeShare(text, cleaned, strokes);
  return {
    ...identity,
    width: text.width,
    height: text.height,
    referenceBoxes: areas.boxes,
    predictedBoxes: predicted,
    detectionRecall: regionRecall(areas.boxes, predicted),
    detectionPrecision: regionPrecision(areas.boxes, predicted),
    detectionPrecisionExcludingKeep: regionPrecision(areas.boxes, translating),
    missedCount: missed.length,
    missedAreaShare: referenceArea === 0 ? 0 : missed.reduce((sum, box) => sum + boxArea(box), 0) / referenceArea,
    ...damage,
    ...residual,
  };
};

export const buildRealReport = (gpu: boolean, pairs: readonly RealPairScore[]): RealEvalReport => ({
  gpu,
  pairCount: pairs.length,
  orderDisagreements: pairs.filter((pair) => !pair.orderAgrees).length,
  summary: {
    detectionRecall: mean(pairs.map((pair) => pair.detectionRecall)),
    detectionPrecision: mean(pairs.map((pair) => pair.detectionPrecision)),
    detectionPrecisionExcludingKeep: mean(pairs.map((pair) => pair.detectionPrecisionExcludingKeep)),
    missedCount: pairs.reduce((sum, pair) => sum + pair.missedCount, 0),
    missedAreaShare: mean(pairs.map((pair) => pair.missedAreaShare)),
    damageCount: mean(pairs.map((pair) => pair.damageCount)),
    damageShare: mean(pairs.map((pair) => pair.damageShare)),
    damageInsideRegion: mean(pairs.map((pair) => pair.damageInsideRegion)),
    damageOutsideRegion: mean(pairs.map((pair) => pair.damageOutsideRegion)),
    residualStrokeShare: mean(pairs.map((pair) => pair.residualStrokeShare)),
  },
  pairs: [...pairs],
});
