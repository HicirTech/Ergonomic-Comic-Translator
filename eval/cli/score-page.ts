import { boundingBoxOfPoints } from "../../src/geometry/box.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import { dilateSquare } from "../../src/imaging/morphology.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import { pageText } from "../../src/pipeline/volume-text.ts";
import type { OcrCandidate } from "../../src/stages/ocr/interfaces/index.ts";
import { changesOutsideMask, maskedMae, regionPrecision, regionRecall } from "../metrics/vision-metrics.ts";
import {
  bestQuarterTurn,
  characterErrorRate,
  chosenTurnIsBest,
  matchByIou,
  productReaderChoice,
  referenceOrderIsClosest,
  removalHaloRadiusPx,
  sentenceChoiceIsBest,
  strongResidualShare,
  writingModeMatches,
} from "../metrics/ocr-metrics.ts";
import { chosenLineQuarterTurns } from "../synthetic/line-geometry.ts";
import type { SyntheticPage } from "../synthetic/interfaces/index.ts";
import type { OcrBlockScore, OcrLineRotation, OcrRemovalScore } from "./interfaces/index.ts";

/** Manga volumes are vertical and right-to-left unless the language says otherwise (volume-stages). */
const evalReadingDirection = "rtl" as const;

const minOrderLines = 2;
const maxOrderLines = 4;

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

const removalOf = (background: RgbImage, cleaned: RgbImage, mask: Uint8Array): OcrRemovalScore => {
  if (background.width !== cleaned.width || background.height !== cleaned.height || mask.length !== background.width * background.height) {
    throw new Error(`Cleaned page is ${cleaned.width}x${cleaned.height}, background is ${background.width}x${background.height}`);
  }
  const dilated = dilateSquare(mask, background.width, background.height, removalHaloRadiusPx);
  return {
    maskedMae: maskedMae(cleaned.data, background.data, mask),
    changesOutsideDilatedMask: changesOutsideMask(cleaned.data, background.data, dilated),
    strongResidualShare: strongResidualShare(cleaned.data, background.data, mask),
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
) => {
  if (baberuReads.length !== page.blocks.length || mangaReads.length !== page.blocks.length) {
    throw new Error(`${page.id}: reader results do not match the ${page.blocks.length} blocks`);
  }
  const predictedBoxes = vision.regions.map((region) => region.box);
  const gtBoxes = page.blocks.map((block) => boundingBoxOfPoints(block.polygon));
  const matches = matchByIou(gtBoxes, predictedBoxes);
  const matchAt = new Map(matches.map((match) => [match.referenceIndex, match]));
  let lineCursor = 0;
  const blocks: OcrBlockScore[] = page.blocks.map((block, index) => {
    const match = matchAt.get(index);
    const region = match ? vision.regions[match.predictedIndex] : undefined;
    const choice = productReaderChoice(region?.utterances ?? []);
    const productTurn = choice?.quarterTurns ?? null;
    const predictedDirection = region?.orientation.writingMode ?? null;
    const reference = [...block.lines].sort((a, b) => a.order - b.order).map((line) => line.text).join("");
    const predicted = region ? pageText(page.index + 1, [region], evalReadingDirection).units.map((unit) => unit.source).join("") : "";
    const lineTexts = [...block.lines].sort((a, b) => a.order - b.order).map((line) => line.text);
    const baberu = turnsOf(reference, baberuReads[index]);
    const manga = turnsOf(reference, mangaReads[index]);
    return {
      blockId: block.id,
      kind: block.kind,
      direction: block.direction,
      sentenceKey: block.sentenceKey,
      box: gtBoxes[index]!,
      matched: match !== undefined,
      iou: match?.iou ?? 0,
      predictedDirection,
      productEngine: choice?.engine ?? null,
      productQuarterTurns: productTurn,
      writingModeMatch: writingModeMatches(block.direction, predictedDirection),
      sentenceRotationMatch: sentenceChoiceIsBest(choice, baberu.cerByTurn, manga.cerByTurn),
      reference,
      predicted,
      cer: characterErrorRate(reference, predicted),
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
  return {
    id: page.id,
    predictedBoxes,
    detectionRecall: regionRecall(gtBoxes, predictedBoxes),
    detectionPrecision: regionPrecision(gtBoxes, predictedBoxes),
    removal: removalOf(background, cleaned, mask),
    blocks,
    rotations,
  };
};
