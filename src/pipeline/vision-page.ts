import type { TextLine } from "../stages/lines/interfaces/index.ts";
import type { OcrCandidate } from "../stages/ocr/interfaces/index.ts";
import { assignLines } from "../stages/regions/assign-lines.ts";
import { consolidateDetections } from "../stages/regions/consolidate.ts";
import { promoteLines, worthReading } from "../stages/regions/promote-lines.ts";
import { cleanPage } from "./clean-page.ts";
import type { PageVisionResult, StageTimer, VisionClient } from "./interfaces/index.ts";
import { lineCrop, orientRegions, planUtterances } from "./plan-utterances.ts";
import { readPlannedUtterances, utteranceResults } from "./read-utterances.ts";

/**
 * R wave for one page: detection, line geometry, region repair, the OCR gate that turns missed dialogue
 * lines into regions, orientation, utterance splitting, OCR with orientation search, masks and cleaning.
 * Model calls go through `client`; everything else is pure stage code. `pageKey` names the files written
 * into `workDirectory`.
 */
export const runVisionPage = async (
  client: VisionClient,
  imagePath: string,
  pageKey: string,
  workDirectory: string,
  writingPrior: "h" | "v",
): Promise<PageVisionResult> => {
  const timingsMs: Record<string, number> = {};
  const timed: StageTimer = async (name, work) => {
    const started = performance.now();
    const result = await work();
    timingsMs[name] = (timingsMs[name] ?? 0) + performance.now() - started;
    return result;
  };

  const { width, height, detections } = await timed("detect", () => client.detect(imagePath));
  const { bubbles, candidates } = consolidateDetections(detections);
  const cropLines = candidates.length > 0 ? await timed("lines", () => client.lines(imagePath, candidates.map((candidate) => candidate.box))) : [];
  const [pageLines = []] = await timed("page_lines", () => client.lines(imagePath, null));
  const assigned = assignLines(candidates, bubbles, cropLines, pageLines);
  const gateLines = assigned.uncovered.filter(worthReading);
  const gateReads = gateLines.length > 0 ? await timed("gate_ocr", () => client.recognizeLines(imagePath, gateLines.map(lineCrop))) : [];
  const gateReading = new Map(gateLines.map((line, index) => [line, gateReads[index]?.[0]]));
  const promotion = promoteLines(assigned.uncovered, assigned.uncovered.map((line) => gateReading.get(line)));
  const regions = [...assigned.regions, ...promotion.regions];
  const { uncovered } = promotion;
  const oriented = orientRegions(regions);

  const allLines = oriented.flatMap(({ region }) => region.lines);
  const structure = allLines.length > 0 ? await timed("structure_ocr", () => client.recognizeLines(imagePath, allLines.map(lineCrop))) : [];
  const structureOf = new Map<TextLine, OcrCandidate>(allLines.map((line, index) => [line, structure[index]![0]!]));

  const planned = planUtterances(oriented, structureOf, writingPrior);
  const chosen = await readPlannedUtterances(client, imagePath, planned, timed);
  const { regions: results, cleanedPath } = await cleanPage(
    client,
    imagePath,
    pageKey,
    workDirectory,
    oriented,
    (regionIndex) => utteranceResults(planned, chosen, regionIndex),
    timed,
  );
  return { width, height, regions: results, uncovered, cleanedPath, timingsMs };
};
