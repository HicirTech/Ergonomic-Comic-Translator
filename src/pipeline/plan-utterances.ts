import { unionBox } from "../geometry/box.ts";
import { readingCorners } from "../geometry/rotated-rect.ts";
import type { TextLine } from "../stages/lines/interfaces/index.ts";
import type { OcrCandidate, OcrCrop } from "../stages/ocr/interfaces/index.ts";
import { joinLineReadings } from "../stages/ocr/line-reading.ts";
import { canProbeUpsideDown, planQuarterTurns, utteranceCrop } from "../stages/ocr/ocr-plan.ts";
import { lineBox } from "../stages/regions/assign-lines.ts";
import type { PageRegion } from "../stages/regions/interfaces/index.ts";
import { estimateOrientation, groupByDirection } from "../stages/regions/orientation.ts";
import { splitUtterances, toUtteranceLines } from "../stages/utterances/split-utterances.ts";
import type { OrientedRegion, PlannedUtterance } from "./interfaces/index.ts";

/** Text of this many characters or fewer is read by manga-ocr only (orientation-insensitive on short text). */
const shortTextChars = 3;
/** Short text is always searched: its DB angle is unreliable (p90 error about 25 degrees). */
const allTurns = [0, 1, 3];

/** Crop reading one line left to right (vertical columns come out turned 90 degrees counter-clockwise). */
export const lineCrop = (line: TextLine): OcrCrop => ({
  corners: readingCorners(line.rect),
  width: Math.max(1, Math.round(line.rect.long)),
  height: Math.max(1, Math.round(line.rect.short)),
  quarterTurns: [0],
});

/** Probe crop for textline-ori. Only one horizontal line qualifies; the crop is already left to right. */
const upsideDownCrop = (
  mode: "h" | "v",
  upright: readonly { line: TextLine }[],
  indexes: readonly number[],
): OcrCrop | null => {
  if (!canProbeUpsideDown(mode, indexes.length)) return null;
  const source = upright[indexes[0]!];
  return source ? lineCrop(source.line) : null;
};

/** Splits regions whose lines run in different directions, then estimates each part's orientation. */
export const orientRegions = (regions: readonly PageRegion[]): OrientedRegion[] =>
  regions.flatMap((region) => {
    const groups = groupByDirection(region.lines);
    if (groups.length <= 1) {
      return [{ region, orientation: estimateOrientation(region.lines, region.box) }];
    }
    return groups.map((lines) => {
      const part: PageRegion = { ...region, box: unionBox(lines.map(lineBox)), lines };
      return { region: part, orientation: estimateOrientation(lines, part.box) };
    });
  });

/**
 * Splits every region into utterances (using structure OCR for brackets and name tags) and plans one OCR
 * crop per utterance. Regions without lines are read whole, with the orientation search. A horizontal
 * utterance keeps the structure OCR of its own lines, joined, for when the sentence reader loses text.
 */
export const planUtterances = (
  oriented: readonly OrientedRegion[],
  structureOf: ReadonlyMap<TextLine, OcrCandidate>,
  writingPrior: "h" | "v",
): PlannedUtterance[] =>
  oriented.flatMap(({ region, orientation }, regionIndex): PlannedUtterance[] => {
    const mode = orientation.writingMode ?? writingPrior;
    const turns = planQuarterTurns(orientation, region.lines.length > 0);
    const upright = toUtteranceLines(region.lines, orientation.frame, mode);
    if (upright.length === 0) {
      const { frame } = orientation;
      const box = { x0: frame.cx - frame.w / 2, y0: frame.cy - frame.h / 2, x1: frame.cx + frame.w / 2, y1: frame.cy + frame.h / 2 };
      const split = { lines: [], startReasons: [], styleBreaks: [], nameTag: false, thought: false };
      return [{ regionIndex, split, box, crop: utteranceCrop(frame, box, turns), engine: "baberu", writingMode: mode, lineCrop: null, lineReading: null }];
    }
    const text = (line: TextLine) => structureOf.get(line)?.text ?? "";
    const splits = splitUtterances(upright.map(({ line, box }) => ({ box, text: text(line), conf: structureOf.get(line)?.meanProb ?? 0 })), mode);
    return splits.map((split) => {
      const box = unionBox(split.lines.map((index) => upright[index]!.box));
      const chars = split.lines.reduce((sum, index) => sum + [...text(upright[index]!.line)].length, 0);
      const short = chars > 0 && chars <= shortTextChars;
      return {
        regionIndex,
        split,
        box,
        crop: utteranceCrop(orientation.frame, box, short ? allTurns : turns),
        engine: short ? "manga-ocr" : "baberu",
        writingMode: mode,
        lineCrop: upsideDownCrop(mode, upright, split.lines),
        // Horizontal lines only: on vertical columns the line recognizer is the weaker reader.
        lineReading: mode === "h" ? joinLineReadings(split.lines.map((index) => structureOf.get(upright[index]!.line))) : null,
      };
    });
  });
