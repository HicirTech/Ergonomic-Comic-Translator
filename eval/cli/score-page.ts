import { boundingBoxOfPoints } from "../../src/geometry/box.ts";
import type { Point } from "../../src/geometry/interfaces/index.ts";
import { rasterizeConvexQuad } from "../../src/geometry/raster.ts";
import { labelComponents } from "../../src/imaging/components.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import { dilateSquare } from "../../src/imaging/morphology.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import { pageText } from "../../src/pipeline/volume-text.ts";
import type { OcrCandidate } from "../../src/stages/ocr/interfaces/index.ts";
import { readingOrder } from "../../src/stages/order/reading-order.ts";
import type { RegionClass } from "../../src/stages/regions/interfaces/index.ts";
import { maskedMae, regionPrecision } from "../metrics/vision-metrics.ts";
import {
  bestQuarterTurn,
  characterErrorRate,
  chosenTurnIsBest,
  matchByCoverage,
  productReaderChoice,
  referenceOrderIsClosest,
  removalHaloRadiusPx,
  sentenceChoiceIsBest,
  strongResidualShare,
  writingModeMatches,
} from "../metrics/ocr-metrics.ts";
import { artOutlineWidthPx, outlinedKinds } from "../synthetic/constants.ts";
import { chosenLineQuarterTurns } from "../synthetic/line-geometry.ts";
import type { SyntheticPage } from "../synthetic/interfaces/index.ts";
import type { OcrBlockScore, OcrLineRotation, OcrRemovalScore, SearchCandidate } from "./interfaces/index.ts";
import { attributeOutsideChanges, falsePositivesOf, sfxScoreOf } from "./page-diagnostics.ts";
import { evalReadingDirection, plannedSearchReads } from "./search-reads.ts";

const minOrderLines = 2;
const maxOrderLines = 4;

/** Whether the product keeps every region a block matched as lettering: it is neither translated nor cleaned. */
export const keptAsLettering = (classes: readonly RegionClass[]) => classes.length > 0 && classes.every((item) => item.policy === "keep");

/**
 * The page area of the blocks the product keeps: each layout box with the margin its outline stroke adds,
 * and every piece of the text mask that reaches into it, since a glyph may stand out of its box.
 */
export const keptLetteringMask = (mask: Uint8Array, width: number, height: number, blocks: readonly { polygon: readonly Point[]; margin: number }[]) => {
  const kept = new Uint8Array(width * height);
  for (const block of blocks) {
    const area = new Uint8Array(width * height);
    rasterizeConvexQuad(area, width, height, block.polygon);
    const grown = dilateSquare(area, width, height, block.margin);
    for (let index = 0; index < kept.length; index += 1) kept[index] = kept[index]! | grown[index]!;
  }
  const pieces = labelComponents(mask, width, height);
  const reaching = new Uint8Array(pieces.components.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (kept[index] && pieces.labels[index]) reaching[pieces.labels[index]! - 1] = 1;
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (pieces.labels[index] && reaching[pieces.labels[index]! - 1]) kept[index] = 1;
  }
  return kept;
};

/** The mask without the kept area: ink that is meant to stay is no residue. */
export const maskWithout = (mask: Uint8Array, kept: Uint8Array) => mask.map((value, index) => value & (kept[index]! ^ 1));

/** The cleaned page as it is judged: where lettering is kept, the page is taken as it should look, so kept ink is no damage. */
const judgedPage = (cleaned: RgbImage, background: RgbImage, kept: Uint8Array): RgbImage => {
  const data = cleaned.data.slice();
  for (let index = 0; index < kept.length; index += 1) {
    if (kept[index]) data.set(background.data.subarray(index * 3, index * 3 + 3), index * 3);
  }
  return { data, width: cleaned.width, height: cleaned.height };
};

const quarterTurns = [0, 1, 2, 3] as const;

const textAt = (candidates: readonly OcrCandidate[] | undefined, turn: number) =>
  candidates?.find((candidate) => candidate.quarterTurns === turn)?.text ?? "";

const turnsOf = (reference: string, candidates: readonly OcrCandidate[] | undefined) => {
  const hypotheses = quarterTurns.map((turn) => textAt(candidates, turn));
  const cerByTurn = hypotheses.map((text) => characterErrorRate(reference, text));
  return {
    hypotheses: hypotheses as [string, string, string, string],
    cerByTurn: cerByTurn as [number, number, number, number],
    bestTurn: bestQuarterTurn(cerByTurn),
  };
};

/** Both readers are scored at the pipeline's turn, including the engine it did not call. */
const cerAtProductTurn = (cerByTurn: readonly number[], turn: number | null) =>
  turn !== null && turn >= 0 && turn < cerByTurn.length ? cerByTurn[turn]! : null;

const removalOf = (
  background: RgbImage,
  cleaned: RgbImage,
  mask: Uint8Array,
  regions: readonly { box: PageVisionResult["regions"][number]["box"]; clean: PageVisionResult["regions"][number]["clean"]; matched: boolean }[],
): OcrRemovalScore => {
  if (background.width !== cleaned.width || background.height !== cleaned.height || mask.length !== background.width * background.height) {
    throw new Error(`Cleaned page is ${cleaned.width}x${cleaned.height}, background is ${background.width}x${background.height}`);
  }
  const dilated = dilateSquare(mask, background.width, background.height, removalHaloRadiusPx);
  const damage = attributeOutsideChanges(background.data, cleaned.data, background.width, background.height, dilated, regions);
  return {
    maskedMae: maskedMae(cleaned.data, background.data, mask),
    changesOutsideDilatedMask: damage.changed,
    strongResidualShare: strongResidualShare(cleaned.data, background.data, mask),
    damage,
  };
};

const rotationOf = (
  blockId: string,
  lineOrder: number,
  reference: string,
  candidates: readonly OcrCandidate[] | undefined,
): OcrLineRotation => {
  const read = turnsOf(reference, candidates);
  return {
    blockId,
    lineOrder,
    reference,
    hypotheses: read.hypotheses,
    cerByTurn: read.cerByTurn,
    bestTurn: read.bestTurn,
    chosenTurn: chosenLineQuarterTurns,
    chosenIsBest: chosenTurnIsBest(read.cerByTurn, chosenLineQuarterTurns),
  };
};

/**
 * Scores one page. `lineReads` and the two reader arrays follow block order, then line order.
 * The translated string is what pageText would send, not the raw utterance list.
 */
export const scoreSyntheticPage = (
  page: SyntheticPage,
  vision: PageVisionResult,
  background: RgbImage,
  cleaned: RgbImage,
  mask: Uint8Array,
  lineReads: readonly (readonly OcrCandidate[])[],
  baberuReads: readonly (readonly OcrCandidate[])[],
  mangaReads: readonly (readonly OcrCandidate[])[],
  searchReads: readonly (readonly OcrCandidate[])[],
) => {
  if (baberuReads.length !== page.blocks.length || mangaReads.length !== page.blocks.length) {
    throw new Error(`${page.id}: reader results do not match the ${page.blocks.length} blocks`);
  }
  const predictedBoxes = vision.regions.map((region) => region.box);
  const gtBoxes = page.blocks.map((block) => boundingBoxOfPoints(block.polygon));
  const matches = matchByCoverage(gtBoxes, predictedBoxes);
  const matchAt = new Map(matches.map((match) => [match.referenceIndex, match]));
  const searchPlan = plannedSearchReads(gtBoxes, vision.regions);
  if (searchReads.length !== searchPlan.length) {
    throw new Error(`${page.id}: ${searchReads.length} search reads for ${searchPlan.length} multi-turn utterances`);
  }
  const references = page.blocks.map((block) => [...block.lines].sort((a, b) => a.order - b.order).map((line) => line.text).join(""));
  const searchByBlock = new Map<number, SearchCandidate[]>();
  searchPlan.forEach((item, index) => {
    const found = searchByBlock.get(item.blockIndex) ?? [];
    for (const candidate of searchReads[index] ?? []) {
      found.push({
        utteranceIndex: item.utteranceIndex,
        quarterTurns: candidate.quarterTurns,
        meanProb: candidate.meanProb,
        cer: characterErrorRate(references[item.blockIndex]!, candidate.text),
      });
    }
    searchByBlock.set(item.blockIndex, found);
  });
  let lineCursor = 0;
  const blocks: OcrBlockScore[] = page.blocks.map((block, index) => {
    const match = matchAt.get(index)!;
    const covering = match.predictedIndexes.map((predictedIndex) => vision.regions[predictedIndex]!);
    const ordered = readingOrder(covering.map((region) => region.box), evalReadingDirection).map((regionIndex) => covering[regionIndex]!);
    const missed = match.matchType === "missed";
    const utterances = ordered.flatMap((region) => region.utterances);
    const choice = missed ? null : productReaderChoice(utterances);
    const productTurn = choice?.quarterTurns ?? null;
    const modes = ordered.map((region) => region.orientation.writingMode);
    const predictedDirection = modes.length > 0 && modes.every((mode) => mode === modes[0]) ? modes[0]! : null;
    const classes = ordered.map((region) => region.classification);
    const sameClass = classes.length > 0 && classes.every((item) =>
      item.layout === classes[0]!.layout && item.kind === classes[0]!.kind && item.policy === classes[0]!.policy);
    const reference = references[index]!;
    const kept = !missed && keptAsLettering(classes);
    const predicted = missed
      ? ""
      : kept
        ? utterances.map((utterance) => utterance.text).join("")
        : pageText(page.index + 1, ordered, evalReadingDirection).units.map((unit) => unit.source).join("");
    const lineTexts = [...block.lines].sort((a, b) => a.order - b.order).map((line) => line.text);
    const baberu = turnsOf(reference, baberuReads[index]);
    const manga = turnsOf(reference, mangaReads[index]);
    return {
      blockId: block.id,
      kind: block.kind,
      direction: block.direction,
      sentenceKey: block.sentenceKey,
      box: gtBoxes[index]!,
      matchType: match.matchType,
      iou: match.iou,
      predictedDirection,
      productEngine: choice?.engine ?? null,
      productQuarterTurns: productTurn,
      writingModeMatch: !missed && writingModeMatches(block.direction, predictedDirection),
      sentenceRotationMatch: !missed && sentenceChoiceIsBest(choice, baberu.cerByTurn, manga.cerByTurn),
      classification: sameClass ? classes[0]! : null,
      pipelineUtterances: utterances.map((utterance) => ({
        quarterTurns: utterance.quarterTurns,
        flags: [...utterance.flags],
      })),
      searchCandidates: searchByBlock.get(index) ?? null,
      reference,
      predicted,
      kept,
      cer: missed ? 1 : characterErrorRate(reference, predicted),
      lineOrderMatch: lineTexts.length >= minOrderLines && lineTexts.length <= maxOrderLines
        ? referenceOrderIsClosest(lineTexts, predicted)
        : null,
      baberuHypotheses: baberu.hypotheses,
      baberuCerByTurn: baberu.cerByTurn,
      baberuBestTurn: baberu.bestTurn,
      baberuProductCer: cerAtProductTurn(baberu.cerByTurn, productTurn),
      mangaOcrHypotheses: manga.hypotheses,
      mangaOcrCerByTurn: manga.cerByTurn,
      mangaOcrBestTurn: manga.bestTurn,
      mangaOcrProductCer: cerAtProductTurn(manga.cerByTurn, productTurn),
    };
  });
  const rotations: OcrLineRotation[] = page.blocks.flatMap((block) => block.lines.map((line) => {
    const rotation = rotationOf(block.id, line.order, line.text, lineReads[lineCursor]);
    lineCursor += 1;
    return rotation;
  }));
  if (lineCursor !== lineReads.length) throw new Error(`${page.id}: ${lineReads.length} line reads for ${lineCursor} lines`);
  const claimed = new Set(matches.flatMap((match) => match.predictedIndexes));
  const kept = keptLetteringMask(mask, background.width, background.height, page.blocks
    .filter((_block, index) => blocks[index]!.kept)
    .map((block) => ({ polygon: block.polygon, margin: outlinedKinds.has(block.kind) ? Math.ceil(artOutlineWidthPx(block.fontSize)) : 0 })));
  return {
    id: page.id,
    predictedBoxes,
    detectionRecall: gtBoxes.length === 0 ? 1 : matches.filter((match) => match.matchType !== "missed").length / gtBoxes.length,
    detectionPrecision: regionPrecision(gtBoxes, predictedBoxes),
    removal: removalOf(background, judgedPage(cleaned, background, kept), maskWithout(mask, kept), vision.regions.map((region, index) => ({
      box: region.box,
      clean: region.clean,
      matched: claimed.has(index),
    }))),
    falsePositives: falsePositivesOf(page, vision.regions, claimed),
    sfx: sfxScoreOf(page, vision.regions, claimed, background.data, cleaned.data),
    blocks,
    rotations,
  };
};
