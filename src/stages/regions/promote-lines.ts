import { lineAngleDistance } from "../../geometry/angle.ts";
import { containsPoint, expandBox, intersectionArea, unionBox } from "../../geometry/box.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import { textThickness } from "../lines/text-thickness.ts";
import type { OcrReading } from "../ocr/interfaces/index.ts";
import { lineBox } from "./assign-lines.ts";
import { soundLike } from "./classify.ts";
import type { PageRegion } from "./interfaces/index.ts";

/**
 * A line of five characters is at least this many times longer than thick (measured: a DB rectangle is
 * about 1.4 times as thick as its characters are tall).
 */
const minLengthToThickness = 3.2;
/** A dialogue line: the line recognizer reaches this mean probability ... */
const minProb = 0.85;
/** ... on at least this many characters: dialogue is longer than art lettering. */
const minChars = 5;
/**
 * Inside a bubble one letter read with this probability is enough: what stands in a bubble is dialogue,
 * whatever its size. Measured on one volume against its earlier translation: the rule takes 4 of the 6 lines
 * in bubbles that had been translated (the other two are a stray dot and a three-character sound) and none
 * of the 14 that had been left alone.
 */
const minBubbleProb = 0.7;
/**
 * Short typeset text outside every bubble (a large "yes" in a dialogue box the detector did not find):
 * upright, not curved, read almost with certainty, two letters or more, not a sound. Measured on two
 * volumes: it takes the dialogue the detector missed and none of 3,800 lines of art lettering.
 */
const minShortProb = 0.95;
const minShortLetters = 2;
const uprightDegrees = 10;
/** Only lines the line detector is sure of are read for the short rule; most art lettering is not. */
const minShortScore = 0.9;
/** A line this many times thicker than the lines of its bubble's region is set in another size. */
const largerTextRatio = 1.4;
/** Promoted lines closer than this share of their thickness, running the same way, form one region. */
const neighbourGapShare = 0.7;
const sameDirectionDegrees = 15;

const charCount = (text: string) => [...text.replace(/\s/gu, "")].length;
const letterCount = (text: string) => [...text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;

const longEnough = (line: TextLine) => line.rect.long >= minLengthToThickness * line.rect.short;
const upright = (line: TextLine) =>
  Math.min(lineAngleDistance(line.rect.angle, 0), lineAngleDistance(line.rect.angle, 90)) <= uprightDegrees;
const bubbleOf = (line: TextLine, bubbles: readonly Box[]) => bubbles.find((bubble) => containsPoint(bubble, line.rect.center)) ?? null;

const shortTextShape = (line: TextLine) => upright(line) && !line.curved && line.score >= minShortScore;

/** Lines outside every region that the gate has to read: any line in a bubble, and the ones that can pass a rule. */
export const worthReading = (line: TextLine, bubbles: readonly Box[]) =>
  bubbleOf(line, bubbles) !== null || longEnough(line) || shortTextShape(line);

const readsInBubble = (reading: OcrReading | undefined) =>
  reading !== undefined && reading.meanProb >= minBubbleProb && letterCount(reading.text) >= 1;

const readsAsDialogue = (line: TextLine, reading: OcrReading | undefined) =>
  reading !== undefined && longEnough(line) && reading.meanProb >= minProb && charCount(reading.text) >= minChars && !soundLike(reading.text);

const readsAsShortText = (line: TextLine, reading: OcrReading | undefined) =>
  reading !== undefined && shortTextShape(line) && reading.meanProb >= minShortProb
  && letterCount(reading.text) >= minShortLetters && !soundLike(reading.text);

/** Neighbouring lines that run the same way, as one group each. */
const groupNeighbours = (lines: readonly TextLine[]) => {
  const parent = lines.map((_line, index) => index);
  const rootOf = (index: number): number => (parent[index] === index ? index : (parent[index] = rootOf(parent[index]!)));
  for (let a = 0; a < lines.length; a += 1) {
    for (let b = a + 1; b < lines.length; b += 1) {
      const first = lines[a]!;
      const second = lines[b]!;
      if (lineAngleDistance(first.rect.angle, second.rect.angle) > sameDirectionDegrees) continue;
      const reach = neighbourGapShare * Math.min(first.rect.short, second.rect.short);
      if (intersectionArea(expandBox(lineBox(first), reach), lineBox(second)) > 0) parent[rootOf(b)] = rootOf(a);
    }
  }
  const groups = new Map<number, TextLine[]>();
  lines.forEach((line, index) => groups.set(rootOf(index), [...(groups.get(rootOf(index)) ?? []), line]));
  return [...groups.values()];
};

/**
 * S3a, OCR gate: lines the detector gave no region are text all the same when the line recognizer reads
 * them as such. A line in a bubble is dialogue the detector's text box did not reach, when it is set in
 * the ink of that bubble's text (`sameInk`; art lettering drawn across a bubble is not): it joins the region
 * of that bubble, or becomes a region in that bubble when it is set larger or the bubble has none. Outside
 * bubbles a confident dialogue line, and a short piece of typeset text in the ink of the page's dialogue,
 * become regions of their own, neighbours together. `readings[i]` is the reading of `lines[i]`, undefined
 * when it was not read. Every other line stays uncovered.
 */
export const promoteLines = (
  regions: readonly PageRegion[],
  lines: readonly TextLine[],
  readings: readonly (OcrReading | undefined)[],
  bubbles: readonly Box[],
  sameInk: (line: TextLine, others: readonly TextLine[]) => boolean = () => true,
) => {
  const inBubble = new Map<Box, TextLine[]>();
  const free: TextLine[] = [];
  const pageDialogue = regions.filter((region) => region.bubble !== null).flatMap((region) => region.lines);
  lines.forEach((line, index) => {
    const reading = readings[index];
    const bubble = bubbleOf(line, bubbles);
    const dialogue = bubble ? regions.find((region) => region.bubble === bubble && region.lines.length > 0) : undefined;
    if (bubble && readsInBubble(reading) && (!dialogue || sameInk(line, dialogue.lines))) inBubble.set(bubble, [...(inBubble.get(bubble) ?? []), line]);
    else if (readsAsDialogue(line, reading)) free.push(line);
    // Short text has little to be told by: it also has to be set in the ink of the page's dialogue.
    else if (readsAsShortText(line, reading) && (pageDialogue.length === 0 || sameInk(line, pageDialogue))) free.push(line);
  });

  // A line of the size of the bubble's text continues it. A clearly larger one is another utterance, set
  // and placed on its own (a loud aside beside the dialogue), and is read and lettered on its own too.
  const joined = regions.map((region) => {
    const extra = region.bubble ? inBubble.get(region.bubble) : undefined;
    if (!region.bubble || !extra) return region;
    const thickness = textThickness(region.lines);
    const same = thickness === null ? extra : extra.filter((line) => line.rect.short < largerTextRatio * thickness);
    inBubble.set(region.bubble, extra.filter((line) => !same.includes(line)));
    return same.length === 0 ? region : { ...region, box: unionBox([region.box, ...same.map(lineBox)]), lines: [...region.lines, ...same] };
  });
  const promoted: PageRegion[] = [
    ...[...inBubble].flatMap(([bubble, group]) => groupNeighbours(group).map((part) => ({ box: unionBox(part.map(lineBox)), cls: null, score: null, bubble, lines: part }))),
    ...groupNeighbours(free).map((group) => ({ box: unionBox(group.map(lineBox)), cls: null, score: null, bubble: null, lines: group })),
  ];
  const taken = new Set([...joined, ...promoted].flatMap((region) => region.lines));
  return { regions: [...joined, ...promoted], uncovered: lines.filter((line) => !taken.has(line)) };
};
