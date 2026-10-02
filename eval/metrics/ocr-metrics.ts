import { coverage, iou } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { CerGap, CoverageMatch, IouMatch } from "./interfaces/index.ts";

/** Vertical CER may exceed the horizontal CER of the same sentence by at most this much. */
export const verticalCerGapLimit = 0.05;
/** Share of line-recognizer crops whose chosen quarter turn has the lowest CER of the four. */
export const rotationBestShareMin = 0.95;
/** Share of blocks whose pipeline sentence reader picked a turn with that engine's lowest CER. */
export const sentenceRotationBestShareMin = 0.95;
/** Share of claimed blocks whose region writing mode matches the label. A miss is not a decision. */
export const writingModeAccuracyMin = 0.95;
export const lineOrderAccuracyMin = 0.95;

/** Greedy IoU match ignores pairs below this. Detector boxes are loose, so half-overlap counts. */
export const iouMatchMin = 0.5;
/**
 * A region claims a block when it covers at least this share of the block area.
 * IoU is not a gate: a bubble around a thin column is far below 0.5 IoU and still a claim.
 */
export const coverageMatchMin = 0.5;
/** A cleaned text pixel still "holds ink" when any channel differs from the background by this much. */
export const strongResidualDelta = 32;
/** Inpaint kernels bleed a couple of pixels; changes inside this dilation are not counted as spill. */
export const removalHaloRadiusPx = 2;

const minLinesForOrder = 2;
const maxLinesForOrder = 4;

/** Insert, delete and substitute over code points (already split; not UTF-16 units). */
export const levenshtein = (left: readonly string[], right: readonly string[]) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const next = new Array<number>(right.length + 1);
  for (let row = 0; row < left.length; row += 1) {
    next[0] = row + 1;
    for (let column = 0; column < right.length; column += 1) {
      const cost = left[row] === right[column] ? 0 : 1;
      next[column + 1] = Math.min(next[column]! + 1, previous[column + 1]! + 1, previous[column]! + cost);
    }
    for (let column = 0; column < next.length; column += 1) previous[column] = next[column]!;
  }
  return previous[right.length]!;
};

/** NFKC, then drop whitespace, so a vertical crop that lost its spaces still matches the sentence. */
export const normalizeForCer = (text: string) => text.normalize("NFKC").replace(/\s+/gu, "");

/**
 * Edit distance over the reference length. An empty reference is 0 only when the hypothesis is empty
 * too; otherwise it is a total miss (there is no length to divide by).
 */
export const characterErrorRate = (reference: string, hypothesis: string) => {
  const left = [...normalizeForCer(reference)];
  const right = [...normalizeForCer(hypothesis)];
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  return levenshtein(left, right) / left.length;
};

const permutations = (items: readonly string[]): string[][] => {
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
};

/**
 * True when the labelled line order is strictly closer to `predicted` than every other permutation.
 * A tie, including an empty read (every permutation equally far), does not count: order was not shown.
 * Only blocks of 2 to 4 lines are scored; other lengths return false.
 */
export const referenceOrderIsClosest = (lines: readonly string[], predicted: string) => {
  if (lines.length < minLinesForOrder || lines.length > maxLinesForOrder) return false;
  const distance = (order: readonly string[]) => {
    const reference = [...normalizeForCer(order.join(""))];
    return levenshtein(reference, [...normalizeForCer(predicted)]);
  };
  const [labelled, ...rest] = permutations(lines).map(distance);
  return rest.every((other) => other > labelled!);
};

/** Writing mode only. The sentence reader's quarter turn is scored separately. */
export const writingModeMatches = (label: "h" | "v", chosen: "h" | "v" | null) => chosen === label;

/**
 * Engine and quarter turn the pipeline used for a region's utterances.
 * Null when nothing was read or the utterances disagree: a mixed choice is not a choice.
 */
export const productReaderChoice = (
  utterances: readonly { engine: "baberu" | "manga-ocr"; quarterTurns: number }[],
): { engine: "baberu" | "manga-ocr"; quarterTurns: number } | null => {
  const first = utterances[0];
  if (!first) return null;
  const agreed = utterances.every((item) => item.engine === first.engine && item.quarterTurns === first.quarterTurns);
  return agreed ? { engine: first.engine, quarterTurns: first.quarterTurns } : null;
};

/** Right when that engine's CER at the chosen turn equals its minimum. No choice is not right. */
export const sentenceChoiceIsBest = (
  choice: { engine: "baberu" | "manga-ocr"; quarterTurns: number } | null,
  baberuCerByTurn: readonly number[],
  mangaCerByTurn: readonly number[],
) => {
  if (!choice) return false;
  const cerByTurn = choice.engine === "baberu" ? baberuCerByTurn : mangaCerByTurn;
  return chosenTurnIsBest(cerByTurn, choice.quarterTurns);
};

/** Lowest index among the minimum CER values, so a tie does not depend on object order. */
export const bestQuarterTurn = (cerByTurn: readonly number[]) =>
  cerByTurn.reduce((best, cer, index) => (cer < cerByTurn[best]! ? index : best), 0);

/** True when the chosen turn's CER equals the best, including a tie. */
export const chosenTurnIsBest = (cerByTurn: readonly number[], chosen: number) =>
  cerByTurn[chosen] === Math.min(...cerByTurn);

/**
 * Every region that covers at least half the block claims it, so one bubble may take several
 * blocks and several regions may take one block. IoU only orders the claimants.
 */
export const matchByCoverage = (reference: readonly Box[], predicted: readonly Box[], minCoverage = coverageMatchMin): CoverageMatch[] => {
  const claims = reference.map((refBox) => {
    const areaClaims = predicted.flatMap((predBox, predictedIndex) => {
      const covered = coverage(refBox, predBox);
      return covered >= minCoverage ? [{ predictedIndex, covered, iou: iou(refBox, predBox) }] : [];
    });
    areaClaims.sort((a, b) => b.iou - a.iou || b.covered - a.covered || a.predictedIndex - b.predictedIndex);
    return areaClaims;
  });
  const claimCount = new Map<number, number>();
  for (const list of claims) {
    for (const claim of list) claimCount.set(claim.predictedIndex, (claimCount.get(claim.predictedIndex) ?? 0) + 1);
  }
  return claims.map((list, referenceIndex) => {
    const predictedIndexes = list.map((claim) => claim.predictedIndex);
    const only = predictedIndexes[0];
    const matchType = predictedIndexes.length === 0
      ? "missed"
      : predictedIndexes.length > 1
        ? "split"
        : (claimCount.get(only!) ?? 0) > 1
          ? "merged"
          : "single";
    return { referenceIndex, predictedIndexes, matchType, iou: list[0]?.iou ?? 0 };
  });
};

export const matchByIou = (reference: readonly Box[], predicted: readonly Box[], minIou = iouMatchMin): IouMatch[] => {
  const pairs = reference.flatMap((refBox, referenceIndex) =>
    predicted.map((predBox, predictedIndex) => ({ referenceIndex, predictedIndex, iou: iou(refBox, predBox) })));
  pairs.sort((a, b) => b.iou - a.iou || a.referenceIndex - b.referenceIndex || a.predictedIndex - b.predictedIndex);
  const usedReference = new Set<number>();
  const usedPredicted = new Set<number>();
  const matches: IouMatch[] = [];
  for (const pair of pairs) {
    if (pair.iou < minIou) break;
    if (usedReference.has(pair.referenceIndex) || usedPredicted.has(pair.predictedIndex)) continue;
    usedReference.add(pair.referenceIndex);
    usedPredicted.add(pair.predictedIndex);
    matches.push(pair);
  }
  return matches;
};

/** Mean CER per sentence key. A key with only one direction is omitted; the caller treats no pairs as a fail. */
export const cerGaps = (items: readonly { sentenceKey: string; direction: "h" | "v"; cer: number }[]): CerGap[] => {
  const groups = new Map<string, { horizontal: number[]; vertical: number[] }>();
  for (const item of items) {
    const group = groups.get(item.sentenceKey) ?? { horizontal: [], vertical: [] };
    (item.direction === "h" ? group.horizontal : group.vertical).push(item.cer);
    groups.set(item.sentenceKey, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.horizontal.length > 0 && group.vertical.length > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([sentenceKey, group]) => ({
      sentenceKey,
      horizontalCer: group.horizontal.reduce((sum, cer) => sum + cer, 0) / group.horizontal.length,
      verticalCer: group.vertical.reduce((sum, cer) => sum + cer, 0) / group.vertical.length,
    }));
};

/** No pair is not a pass: the eval has nothing to compare. */
export const verticalCerWithinLimit = (gaps: readonly CerGap[], limit = verticalCerGapLimit) =>
  gaps.length > 0 && gaps.every((gap) => gap.verticalCer - gap.horizontalCer <= limit);

/** Share of text-mask pixels whose cleaned colour is still far from the clean background. */
export const strongResidualShare = (candidate: Uint8Array, reference: Uint8Array, mask: Uint8Array, delta = strongResidualDelta) => {
  let text = 0;
  let strong = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    text += 1;
    const offset = index * 3;
    const worst = Math.max(
      Math.abs(candidate[offset]! - reference[offset]!),
      Math.abs(candidate[offset + 1]! - reference[offset + 1]!),
      Math.abs(candidate[offset + 2]! - reference[offset + 2]!),
    );
    if (worst >= delta) strong += 1;
  }
  return text === 0 ? 0 : strong / text;
};
