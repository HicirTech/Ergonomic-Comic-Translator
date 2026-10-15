import { unionBox } from "../geometry/box.ts";
import { readingCorners } from "../geometry/rotated-rect.ts";
import type { Box } from "../geometry/interfaces/index.ts";
import { warpGray } from "../imaging/warp.ts";
import type { GrayImage } from "../imaging/interfaces/index.ts";
import type { TextLine } from "../stages/lines/interfaces/index.ts";
import { textThickness } from "../stages/lines/text-thickness.ts";
import type { OcrCandidate, OcrCrop } from "../stages/ocr/interfaces/index.ts";
import { cutOffsets, edgeProfile, lineChars, pieceBoxes, pieceCount } from "../stages/ocr/line-pieces.ts";
import { joinLineReadings } from "../stages/ocr/line-reading.ts";
import { canProbeUpsideDown, frameCrop, planQuarterTurns, utteranceCrop } from "../stages/ocr/ocr-plan.ts";
import { lineBox } from "../stages/regions/assign-lines.ts";
import type { OrientedFrame, PageRegion } from "../stages/regions/interfaces/index.ts";
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

/**
 * Crops of one utterance for its sentence reader: its box as one crop, or, when a line holds more characters
 * than one crop reads well, its lines in pieces cut between characters, in reading order.
 */
const utteranceCrops = (
  frame: OrientedFrame,
  mode: "h" | "v",
  members: readonly { line: TextLine; box: Box }[],
  structureOf: ReadonlyMap<TextLine, OcrCandidate>,
  turns: number[],
  gray: GrayImage | null,
): OcrCrop[] => {
  const chars = members.map(({ line }) => lineChars(line, structureOf.get(line)));
  if (gray === null || chars.every((count) => pieceCount(count) === 1)) {
    return [utteranceCrop(frame, unionBox(members.map(({ box }) => box)), turns)];
  }
  return members.flatMap(({ box }, index) => {
    const count = pieceCount(chars[index]!);
    const strip = frameCrop(frame, box, [0]);
    const length = mode === "h" ? strip.width : strip.height;
    const offsets = count === 1
      ? []
      : cutOffsets(edgeProfile(warpGray(gray, strip.corners, strip.width, strip.height), mode), count, length / chars[index]!);
    return pieceBoxes(box, mode, offsets).map((piece) => frameCrop(frame, piece, turns));
  });
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
 * Splits every region into utterances (using structure OCR for brackets and name tags) and plans the OCR
 * crops per utterance: one, or the lines in pieces when a line holds too many characters for one crop
 * (`gray` is the page those pieces are cut on). Regions without lines are read whole, with the orientation
 * search. A horizontal utterance keeps the structure OCR of its own lines, joined, for when the sentence
 * reader loses text.
 */
export const planUtterances = (
  oriented: readonly OrientedRegion[],
  structureOf: ReadonlyMap<TextLine, OcrCandidate>,
  writingPrior: "h" | "v",
  gray: GrayImage | null,
): PlannedUtterance[] =>
  oriented.flatMap(({ region, orientation }, regionIndex): PlannedUtterance[] => {
    const mode = orientation.writingMode ?? writingPrior;
    const turns = planQuarterTurns(orientation, region.lines.length > 0);
    const upright = toUtteranceLines(region.lines, orientation.frame, mode);
    if (upright.length === 0) {
      const { frame } = orientation;
      const box = { x0: frame.cx - frame.w / 2, y0: frame.cy - frame.h / 2, x1: frame.cx + frame.w / 2, y1: frame.cy + frame.h / 2 };
      const split = { lines: [], startReasons: [], styleBreaks: [], nameTag: false, thought: false };
      return [{ regionIndex, split, box, crops: [utteranceCrop(frame, box, turns)], engine: "baberu", writingMode: mode, lineCrop: null, lineReading: null, lineThickness: null, lineIndexes: [] }];
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
        crops: utteranceCrops(orientation.frame, mode, split.lines.map((index) => upright[index]!), structureOf, short ? allTurns : turns, gray),
        engine: short ? "manga-ocr" : "baberu",
        writingMode: mode,
        lineCrop: upsideDownCrop(mode, upright, split.lines),
        // Horizontal lines only: on vertical columns the line recognizer is the weaker reader.
        lineReading: mode === "h" ? joinLineReadings(split.lines.map((index) => structureOf.get(upright[index]!.line))) : null,
        lineThickness: textThickness(split.lines.map((index) => upright[index]!.line)),
        lineIndexes: split.lines.map((index) => region.lines.indexOf(upright[index]!.line)),
      };
    });
  });
