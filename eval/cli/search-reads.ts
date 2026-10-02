import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { RegionResult, VisionClient } from "../../src/pipeline/interfaces/index.ts";
import type { OcrCandidate, OcrCrop } from "../../src/stages/ocr/interfaces/index.ts";
import { planQuarterTurns, utteranceCrop } from "../../src/stages/ocr/ocr-plan.ts";
import { readingOrder } from "../../src/stages/order/reading-order.ts";
import { matchByCoverage } from "../metrics/ocr-metrics.ts";

/** Manga volumes are vertical and right-to-left unless the language says otherwise (volume-stages). */
export const evalReadingDirection = "rtl" as const;

const searchEngines = ["baberu", "manga-ocr"] as const;

/** One utterance the pipeline searched at more than one quarter turn. */
export interface PlannedSearchRead {
  blockIndex: number;
  utteranceIndex: number;
  engine: "baberu" | "manga-ocr";
  crop: OcrCrop;
}

/**
 * Utterance crops for matched regions where planQuarterTurns returned more than [0].
 * The frame, upright box and turns are the ones the pipeline planned.
 */
export const plannedSearchReads = (
  gtBoxes: readonly Box[],
  regions: readonly RegionResult[],
): PlannedSearchRead[] => {
  const matches = matchByCoverage(gtBoxes, regions.map((region) => region.box));
  return matches.flatMap((match) => {
    if (match.matchType === "missed") return [];
    const covering = match.predictedIndexes.map((index) => regions[index]!);
    const ordered = readingOrder(covering.map((region) => region.box), evalReadingDirection).map((index) => covering[index]!);
    let utteranceIndex = 0;
    const reads: PlannedSearchRead[] = [];
    for (const region of ordered) {
      const turns = planQuarterTurns(region.orientation, region.lines.length > 0);
      const multiTurn = turns.length > 1;
      for (const utterance of region.utterances) {
        if (multiTurn) {
          reads.push({
            blockIndex: match.referenceIndex,
            utteranceIndex,
            engine: utterance.engine,
            crop: utteranceCrop(region.orientation.frame, utterance.box, turns),
          });
        }
        utteranceIndex += 1;
      }
    }
    return reads;
  });
};

/** Reads each planned crop with the engine the pipeline used. Empty plans do not call the client. */
export const readPlannedSearches = async (
  client: VisionClient,
  imagePath: string,
  plan: readonly PlannedSearchRead[],
): Promise<OcrCandidate[][]> => {
  const reads: OcrCandidate[][] = plan.map(() => []);
  for (const engine of searchEngines) {
    const indexes = plan.flatMap((item, index) => item.engine === engine ? [index] : []);
    if (indexes.length === 0) continue;
    const results = await client.readUtterances(imagePath, indexes.map((index) => plan[index]!.crop), engine);
    results.forEach((candidates, index) => {
      reads[indexes[index]!] = [...candidates];
    });
  }
  return reads;
};
