import type { OcrCandidate, OcrCrop } from "../stages/ocr/interfaces/index.ts";
import { preferLineReading } from "../stages/ocr/line-reading.ts";
import { canProbeUpsideDown, chooseReading, isUpsideDown, preferFlippedReading } from "../stages/ocr/ocr-plan.ts";
import type { PlannedUtterance, StageTimer, UtteranceResult, VisionClient } from "./interfaces/index.ts";

const engines = ["baberu", "manga-ocr"] as const;

/**
 * Reads every planned utterance with its engine and keeps the most confident orientation.
 * textline-ori then sees only a single horizontal line. A 180-degree re-read replaces that
 * choice only when its mean probability is strictly higher.
 */
export const readPlannedUtterances = async (
  client: VisionClient,
  imagePath: string,
  planned: readonly PlannedUtterance[],
  timed: StageTimer,
) => {
  const chosen = new Map<PlannedUtterance, { reading: OcrCandidate; unsure: boolean }>();
  await timed("ocr", async () => {
    for (const engine of engines) {
      const items = planned.filter((item) => item.engine === engine);
      if (items.length === 0) continue;
      const readings = await client.readUtterances(imagePath, items.map((item) => item.crop), engine);
      readings.forEach((candidates, index) => {
        const choice = chooseReading(candidates, 0);
        if (choice) chosen.set(items[index]!, choice);
      });
    }
  });

  const withText = planned.filter((item) => (chosen.get(item)?.reading.text ?? "") !== "");
  const probes = withText.filter((item): item is PlannedUtterance & { lineCrop: OcrCrop } =>
    item.lineCrop !== null && canProbeUpsideDown(item.writingMode, item.split.lines.length));
  if (probes.length === 0) {
    return chosen;
  }
  // The line crop is already left to right. Applying the utterance turn would rotate it twice.
  const upsideDown = await timed("orientation", () => client.orientation(imagePath, probes.map((item) => item.lineCrop)));
  const flipped = probes.filter((_, index) => {
    const reading = upsideDown[index]?.[0];
    return reading !== undefined && isUpsideDown(reading.upsideDown);
  });
  if (flipped.length === 0) {
    return chosen;
  }

  await timed("ocr", async () => {
    for (const engine of engines) {
      const items = flipped.filter((item) => item.engine === engine);
      if (items.length === 0) continue;
      const crops = items.map((item) => ({ ...item.crop, quarterTurns: [(chosen.get(item)!.reading.quarterTurns + 2) % 4] }));
      const readings = await client.readUtterances(imagePath, crops, engine);
      readings.forEach((candidates, index) => {
        const item = items[index]!;
        const previous = chosen.get(item)!;
        const next = candidates[0];
        if (!next || !preferFlippedReading(previous.reading, next)) return;
        chosen.set(item, { reading: next, unsure: previous.unsure });
      });
    }
  });
  return chosen;
};

/**
 * Result records of one region's utterances, with flag codes for unsure orientation and empty reads.
 * The text is the sentence reader's, or the utterance's lines joined when that reader lost text
 * (preferLineReading); the line recognizer reads along each line, so its text carries no orientation doubt.
 */
export const utteranceResults = (
  planned: readonly PlannedUtterance[],
  chosen: ReadonlyMap<PlannedUtterance, { reading: OcrCandidate; unsure: boolean }>,
  regionIndex: number,
): UtteranceResult[] =>
  planned.filter((item) => item.regionIndex === regionIndex).map((item) => {
    const choice = chosen.get(item);
    const lines = preferLineReading(choice?.reading ?? null, item.lineReading) ? item.lineReading : null;
    const text = lines ? lines.text : choice?.reading.text ?? "";
    return {
      box: item.box,
      lineIndexes: item.lineIndexes,
      lineThickness: item.lineThickness,
      startReasons: item.split.startReasons,
      nameTag: item.split.nameTag,
      thought: item.split.thought,
      text,
      meanProb: lines ? lines.meanProb : choice?.reading.meanProb ?? 0,
      minProb: lines ? lines.lowestLineProb : choice?.reading.minProb ?? 0,
      engine: item.engine,
      textFrom: lines ? "lines" : "sentence",
      quarterTurns: choice?.reading.quarterTurns ?? 0,
      flags: [
        ...(choice?.unsure && !lines ? ["ORIENT_UNSURE"] : []),
        ...(text === "" ? ["OCR_EMPTY"] : []),
      ],
    };
  });
