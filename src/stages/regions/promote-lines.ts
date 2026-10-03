import { lineAngleDistance } from "../../geometry/angle.ts";
import { expandBox, intersectionArea, unionBox } from "../../geometry/box.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import type { OcrReading } from "../ocr/interfaces/index.ts";
import { lineBox } from "./assign-lines.ts";
import { soundLike } from "./classify.ts";
import type { PageRegion } from "./interfaces/index.ts";

/**
 * A line of five characters is at least this many times longer than thick, so shorter lines need no
 * reading at all (measured: a DB rectangle is about 1.4 times as thick as its characters are tall).
 */
const minLengthToThickness = 3.2;
/** The line recognizer must reach this mean probability ... */
const minProb = 0.85;
/** ... on at least this many characters: dialogue is longer than art lettering. */
const minChars = 5;
/** Promoted lines closer than this share of their thickness, running the same way, form one region. */
const neighbourGapShare = 0.7;
const sameDirectionDegrees = 15;

const charCount = (text: string) => [...text.replace(/\s/gu, "")].length;

/** Lines outside every region that are long enough to be worth reading for the gate. */
export const worthReading = (line: TextLine) => line.rect.long >= minLengthToThickness * line.rect.short;

const readsAsDialogue = (reading: OcrReading | undefined) =>
  reading !== undefined && reading.meanProb >= minProb && charCount(reading.text) >= minChars && !soundLike(reading.text);

/**
 * S3a, OCR gate: lines the detector gave no region become regions of their own when the line recognizer
 * reads them as typeset text (confident, five characters or more, not a sound). Measured on two volumes:
 * the gate takes the two dialogue lines the detector missed and none of 3,200 lines of art lettering.
 * `readings[i]` is the reading of `lines[i]`, undefined when it was not read. Neighbouring promoted lines
 * share a region; every other line stays uncovered.
 */
export const promoteLines = (lines: readonly TextLine[], readings: readonly (OcrReading | undefined)[]) => {
  const promoted = lines.filter((line, index) => worthReading(line) && readsAsDialogue(readings[index]));
  const parent = promoted.map((_line, index) => index);
  const rootOf = (index: number): number => (parent[index] === index ? index : (parent[index] = rootOf(parent[index]!)));
  for (let a = 0; a < promoted.length; a += 1) {
    for (let b = a + 1; b < promoted.length; b += 1) {
      const first = promoted[a]!;
      const second = promoted[b]!;
      if (lineAngleDistance(first.rect.angle, second.rect.angle) > sameDirectionDegrees) continue;
      const reach = neighbourGapShare * Math.min(first.rect.short, second.rect.short);
      if (intersectionArea(expandBox(lineBox(first), reach), lineBox(second)) > 0) parent[rootOf(b)] = rootOf(a);
    }
  }
  const groups = new Map<number, TextLine[]>();
  promoted.forEach((line, index) => groups.set(rootOf(index), [...(groups.get(rootOf(index)) ?? []), line]));
  const regions: PageRegion[] = [...groups.values()].map((group) => ({ box: unionBox(group.map(lineBox)), cls: null, score: null, bubble: null, lines: group }));
  return { regions, uncovered: lines.filter((line) => !promoted.includes(line)) };
};
