import { boxArea, intersectionArea } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";

/** A reference area counts as found when predicted regions cover at least half of it. */
const coveredShare = 0.5;

const coveredBy = (target: Box, others: readonly Box[]) => {
  const area = boxArea(target);
  if (area === 0) return false;
  // Overlaps of several predictions may double count; the share is capped by construction at 1 per box.
  const covered = others.reduce((sum, other) => sum + intersectionArea(target, other), 0);
  return covered / area >= coveredShare;
};

/** Region recall: share of reference boxes at least half covered by predicted regions. */
export const regionRecall = (reference: readonly Box[], predicted: readonly Box[]) =>
  reference.length === 0 ? 1 : reference.filter((box) => coveredBy(box, predicted)).length / reference.length;

/** Region precision: share of predicted regions at least half inside reference areas. */
export const regionPrecision = (reference: readonly Box[], predicted: readonly Box[]) =>
  predicted.length === 0 ? 1 : predicted.filter((box) => coveredBy(box, reference)).length / predicted.length;

/** Mean absolute error inside the mask between an inpainted page and the reference (0..255, over RGB). */
export const maskedMae = (candidate: Uint8Array, reference: Uint8Array, mask: Uint8Array) => {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    for (let channel = 0; channel < 3; channel += 1) sum += Math.abs(candidate[index * 3 + channel]! - reference[index * 3 + channel]!);
    count += 3;
  }
  return count === 0 ? 0 : sum / count;
};

/** Pixels outside the mask that differ from the original page; must be 0 for every cleaning path. */
export const changesOutsideMask = (candidate: Uint8Array, original: Uint8Array, mask: Uint8Array) => {
  let changed = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    const offset = index * 3;
    if (candidate[offset] !== original[offset] || candidate[offset + 1] !== original[offset + 1] || candidate[offset + 2] !== original[offset + 2]) {
      changed += 1;
    }
  }
  return changed;
};
