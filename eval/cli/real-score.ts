import { boxArea, intersectionArea } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import { rgbToGray } from "../../src/imaging/gray.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import { dilateSquare } from "../../src/imaging/morphology.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import { lineBox } from "../../src/stages/regions/assign-lines.ts";
import { diffLevel, deriveTextAreas, median3x3 } from "../ground-truth/textless-diff.ts";
import { matchByCoverage } from "../metrics/ocr-metrics.ts";
import { regionPrecision, regionRecall } from "../metrics/vision-metrics.ts";
import type { RealEvalReport, RealPairScore } from "./interfaces/index.ts";

/** Pixels this far from the reference mask are still "outside" when counting damage. */
export const damageHaloRadiusPx = 4;
/** A cleaned pixel this far from the original text page, per channel, counts as damage or as removed. */
export const damageLevel = 24;

/**
 * A translated region with less than this share of its box on the reference areas sits on something the
 * textless variant kept: art lettering the owner wants left alone, or no text at all.
 */
export const offReferenceShare = 0.1;
/** A kept region or a dropped line with at least this share of its box on the reference areas sits on removed text. */
export const onReferenceShare = 0.5;

/** The name runVisionPage gives the whole-page line pass in timingsMs. */
const pageLineTiming = "page_lines";

const mean = (values: readonly number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

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

/** Share of the pixels under `box` that `mask` marks; 0 for a box that holds no pixel. */
const maskShareInBox = (mask: Uint8Array, width: number, height: number, box: Box) => {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(width, Math.ceil(box.x1));
  const y1 = Math.min(height, Math.ceil(box.y1));
  let marked = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) marked += mask[y * width + x]!;
  }
  const pixels = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return pixels === 0 ? 0 : marked / pixels;
};

/**
 * The owner's rule on the textless pairs, which remove dialogue and narration but keep the art: translated
 * regions should sit on removed text, kept regions and dropped lines should not.
 */
const policyScores = (mask: Uint8Array, width: number, height: number, vision: Pick<PageVisionResult, "regions" | "uncovered">) => {
  const onReference = (box: Box) => maskShareInBox(mask, width, height, box);
  const translated = vision.regions.filter((region) => region.classification.policy !== "keep");
  const kept = vision.regions.filter((region) => region.classification.policy === "keep");
  return {
    translatedRegionCount: translated.length,
    translatedOffReference: translated.filter((region) => onReference(region.box) < offReferenceShare).length,
    translatedUncleaned: translated.filter((region) => region.clean === "none").length,
    keptRegionCount: kept.length,
    keptOnReference: kept.filter((region) => onReference(region.box) >= onReferenceShare).length,
    uncoveredCount: vision.uncovered.length,
    uncoveredOnReference: vision.uncovered.filter((line) => onReference(lineBox(line)) >= onReferenceShare).length,
  };
};

/**
 * Recall of the reference boxes by the regions together with the lines outside every region, and by the
 * page lines alone, plus how many page lines overlap a reference box. A page line is a line inside a region
 * or an uncovered one.
 */
const lineScores = (reference: readonly Box[], regionBoxes: readonly Box[], vision: Pick<PageVisionResult, "regions" | "uncovered">) => {
  const uncoveredLines = vision.uncovered.map(lineBox);
  const lineBoxes = [...vision.regions.flatMap((region) => region.lines.map(lineBox)), ...uncoveredLines];
  const touching = lineBoxes.filter((box) => reference.some((target) => intersectionArea(box, target) > 0));
  return {
    lineBoxes,
    // A region box is grown to hold its own lines (assignLines, orientRegions) and regionRecall adds up
    // overlaps, so adding those lines to the regions would count the same pixels twice.
    regionLineRecall: regionRecall(reference, [...regionBoxes, ...uncoveredLines]),
    lineRecall: regionRecall(reference, lineBoxes),
    lineCount: lineBoxes.length,
    touchingLineCount: touching.length,
    lineTouchShare: share(touching.length, lineBoxes.length),
  };
};

/**
 * Scores one confirmed pair: the vision result for the text page against the areas where it differs from
 * the textless page. The textless page is not a cleaning target: these variants remove the box or bubble
 * together with the text, so it only marks where text was.
 */
export const scoreRealPair = (
  identity: Pick<RealPairScore, "id" | "textOrdinal" | "textlessOrdinal" | "textSha256" | "textlessSha256">,
  text: RgbImage,
  textless: RgbImage,
  cleaned: RgbImage,
  vision: Pick<PageVisionResult, "regions" | "uncovered" | "timingsMs">,
): RealPairScore => {
  const areas = deriveTextAreas(text, textless);
  const predicted = vision.regions.map((region) => region.box);
  const translating = vision.regions.filter((region) => region.classification.policy !== "keep").map((region) => region.box);
  const matches = matchByCoverage(areas.boxes, predicted);
  const missed = areas.boxes.filter((_box, index) => matches[index]!.matchType === "missed");
  const referenceArea = areas.boxes.reduce((sum, box) => sum + boxArea(box), 0);
  const damage = damageAgainstOriginal(text, cleaned, areas.mask, predicted);
  const residual = residualStrokeShare(text, cleaned, textStrokeMask(text, textless, areas.mask));
  return {
    ...identity,
    orderAgrees: identity.textlessOrdinal > identity.textOrdinal,
    width: text.width,
    height: text.height,
    referenceBoxes: areas.boxes,
    predictedBoxes: predicted,
    detectionRecall: regionRecall(areas.boxes, predicted),
    ...lineScores(areas.boxes, predicted, vision),
    pageLineMs: vision.timingsMs[pageLineTiming] ?? 0,
    detectionPrecision: regionPrecision(areas.boxes, predicted),
    detectionPrecisionExcludingKeep: regionPrecision(areas.boxes, translating),
    missedCount: missed.length,
    missedAreaShare: referenceArea === 0 ? 0 : missed.reduce((sum, box) => sum + boxArea(box), 0) / referenceArea,
    ...policyScores(areas.mask, text.width, text.height, vision),
    ...damage,
    ...residual,
  };
};

export const buildRealReport = (
  run: Pick<RealEvalReport, "gpu" | "lines" | "groundTruth">,
  pairs: readonly RealPairScore[],
): RealEvalReport => {
  const total = (pick: (pair: RealPairScore) => number) => pairs.reduce((sum, pair) => sum + pick(pair), 0);
  const lineCount = total((pair) => pair.lineCount);
  const touchingLineCount = total((pair) => pair.touchingLineCount);
  return {
    ...run,
    pairCount: pairs.length,
    orderDisagreements: pairs.filter((pair) => !pair.orderAgrees).length,
    summary: {
      detectionRecall: mean(pairs.map((pair) => pair.detectionRecall)),
      regionLineRecall: mean(pairs.map((pair) => pair.regionLineRecall)),
      lineRecall: mean(pairs.map((pair) => pair.lineRecall)),
      lineCount,
      lineTouchShare: share(touchingLineCount, lineCount),
      pageLineMs: mean(pairs.map((pair) => pair.pageLineMs)),
      detectionPrecision: mean(pairs.map((pair) => pair.detectionPrecision)),
      detectionPrecisionExcludingKeep: mean(pairs.map((pair) => pair.detectionPrecisionExcludingKeep)),
      missedCount: total((pair) => pair.missedCount),
      missedAreaShare: mean(pairs.map((pair) => pair.missedAreaShare)),
      translatedRegionCount: total((pair) => pair.translatedRegionCount),
      translatedOffReference: total((pair) => pair.translatedOffReference),
      translatedUncleaned: total((pair) => pair.translatedUncleaned),
      keptRegionCount: total((pair) => pair.keptRegionCount),
      keptOnReference: total((pair) => pair.keptOnReference),
      uncoveredCount: total((pair) => pair.uncoveredCount),
      uncoveredOnReference: total((pair) => pair.uncoveredOnReference),
      damageCount: mean(pairs.map((pair) => pair.damageCount)),
      damageShare: mean(pairs.map((pair) => pair.damageShare)),
      damageInsideRegion: mean(pairs.map((pair) => pair.damageInsideRegion)),
      damageOutsideRegion: mean(pairs.map((pair) => pair.damageOutsideRegion)),
      residualStrokeShare: mean(pairs.map((pair) => pair.residualStrokeShare)),
    },
    pairs: [...pairs],
  };
};
