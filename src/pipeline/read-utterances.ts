import type { OcrCandidate } from "../stages/ocr/interfaces/index.ts";
import { chooseReading, isUpsideDown } from "../stages/ocr/ocr-plan.ts";
import type { PlannedUtterance, StageTimer, UtteranceResult, VisionClient } from "./interfaces/index.ts";

const engines = ["baberu", "manga-ocr"] as const;

/**
 * Reads every planned utterance with its engine, keeps the most confident orientation, then asks
 * textline-ori about each winner and re-reads the ones it finds upside down (180 degrees is never part
 * of the blind search). Returns the chosen reading per utterance.
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
  if (withText.length === 0) {
    return chosen;
  }
  const orientationCrops = withText.map((item) => ({ ...item.crop, quarterTurns: [chosen.get(item)!.reading.quarterTurns] }));
  const upsideDown = await timed("orientation", () => client.orientation(imagePath, orientationCrops));
  const flipped = withText.filter((_, index) => isUpsideDown(upsideDown[index]![0]!.upsideDown));

  await timed("ocr", async () => {
    for (const engine of engines) {
      const items = flipped.filter((item) => item.engine === engine);
      if (items.length === 0) continue;
      const crops = items.map((item) => ({ ...item.crop, quarterTurns: [(chosen.get(item)!.reading.quarterTurns + 2) % 4] }));
      const readings = await client.readUtterances(imagePath, crops, engine);
      readings.forEach((candidates, index) => {
        const item = items[index]!;
        chosen.set(item, { reading: candidates[0]!, unsure: chosen.get(item)!.unsure });
      });
    }
  });
  return chosen;
};

/** Result records of one region's utterances, with flag codes for unsure orientation and empty reads. */
export const utteranceResults = (
  planned: readonly PlannedUtterance[],
  chosen: ReadonlyMap<PlannedUtterance, { reading: OcrCandidate; unsure: boolean }>,
  regionIndex: number,
): UtteranceResult[] =>
  planned.filter((item) => item.regionIndex === regionIndex).map((item) => {
    const choice = chosen.get(item);
    return {
      box: item.box,
      lineIndexes: item.split.lines,
      startReasons: item.split.startReasons,
      nameTag: item.split.nameTag,
      thought: item.split.thought,
      text: choice?.reading.text ?? "",
      meanProb: choice?.reading.meanProb ?? 0,
      minProb: choice?.reading.minProb ?? 0,
      engine: item.engine,
      quarterTurns: choice?.reading.quarterTurns ?? 0,
      flags: [
        ...(choice?.unsure ? ["ORIENT_UNSURE"] : []),
        ...(!choice || choice.reading.text === "" ? ["OCR_EMPTY"] : []),
      ],
    };
  });
