import { boxArea, coverage } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { VisionClient } from "../../src/pipeline/interfaces/index.ts";
import type { OcrCandidate, OcrCrop } from "../../src/stages/ocr/interfaces/index.ts";
import type { ClusterMember, MemberReading, TextlessConfirmation } from "./interfaces/index.ts";
import { deriveTextAreas } from "./textless-diff.ts";

/** Difference boxes read per page: the largest ones, where a dialogue box or a caption would sit. */
export const readBoxLimit = 8;
/** A reading counts as text when its mean token probability reaches this ... */
export const readableMinProb = 0.8;
/** ... and it holds at least this many characters other than white space. */
export const readableMinChars = 2;
/** The textless page has no box that reads as text. */
export const textlessMaxReadableBoxes = 0;
/** A text page has at least this many boxes that read as text. */
export const textMinReadableBoxes = 2;
/** A box with this share inside a larger kept box is the same area, found again in another page difference. */
const duplicateCoverage = 0.5;
/** The line recognizer reads horizontal text upright (turn 0) and vertical text turned counter-clockwise (turn 3). */
const lineRecognizerTurns = [0, 3];
const mangaOcrTurns = [0];

type ReadingClient = Pick<VisionClient, "recognizeLines" | "readUtterances">;

/** Code points other than white space. Not NFKC (normalizeForCer): that turns one "…" into three characters. */
const nonSpaceLength = (text: string) => [...text.replace(/\s/gu, "")].length;

/** True when some reading is confident and long enough to be text rather than noise. */
export const isReadable = (candidates: readonly OcrCandidate[]) =>
  candidates.some((candidate) => candidate.meanProb >= readableMinProb && nonSpaceLength(candidate.text) >= readableMinChars);

/**
 * The largest boxes, at most readBoxLimit, each a distinct area. A page is compared with every other
 * member, so one text area comes back once per comparison; counting it twice would fake a second box.
 */
export const largestDistinctBoxes = (boxes: readonly Box[]) => {
  const kept: Box[] = [];
  for (const box of [...boxes].sort((a, b) => boxArea(b) - boxArea(a) || a.y0 - b.y0 || a.x0 - b.x0)) {
    if (kept.length === readBoxLimit) break;
    if (!kept.some((larger) => coverage(box, larger) >= duplicateCoverage)) kept.push(box);
  }
  return kept;
};

/** Per member, the difference boxes against every other member. A pair's boxes are the same seen from either page. */
const differenceBoxes = (members: readonly ClusterMember[]) => {
  const boxes = members.map((): Box[] => []);
  for (let left = 0; left < members.length; left += 1) {
    for (let right = left + 1; right < members.length; right += 1) {
      const areas = deriveTextAreas(members[left]!.image, members[right]!.image).boxes;
      boxes[left]!.push(...areas);
      boxes[right]!.push(...areas);
    }
  }
  return boxes;
};

const boxCrop = (box: Box, quarterTurns: number[]): OcrCrop => ({
  corners: [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ],
  width: Math.max(1, Math.round(box.x1 - box.x0)),
  height: Math.max(1, Math.round(box.y1 - box.y0)),
  quarterTurns,
});

/** How many of the boxes read as text, by the line recognizer or by manga-ocr. */
const readableBoxCount = async (client: ReadingClient, member: ClusterMember, boxes: readonly Box[]) => {
  if (boxes.length === 0) return 0;
  const lineReads = await client.recognizeLines(member.imagePath, boxes.map((box) => boxCrop(box, lineRecognizerTurns)));
  const mangaReads = await client.readUtterances(member.imagePath, boxes.map((box) => boxCrop(box, mangaOcrTurns)), "manga-ocr");
  return boxes.filter((_box, index) => isReadable([...(lineReads[index] ?? []), ...(mangaReads[index] ?? [])])).length;
};

/**
 * The textless member is the one with the fewest readable boxes, and only when it has none; a tie goes to
 * the later page, as CG volumes append their textless copies. Every other member with enough readable
 * boxes pairs with it. A cluster of k pages has k - 1 candidate pairs, counted in the exclusions.
 */
export const decideTextless = (readings: readonly MemberReading[]): Pick<TextlessConfirmation, "textlessOrdinal" | "pairs" | "excluded"> => {
  const ordered = [...readings].sort((a, b) => a.ordinal - b.ordinal);
  const textless = ordered.reduce((fewest, reading) => (reading.readableBoxCount <= fewest.readableBoxCount ? reading : fewest));
  if (textless.readableBoxCount > textlessMaxReadableBoxes) {
    const everyone = ordered.map((reading) => reading.ordinal);
    return { textlessOrdinal: null, pairs: [], excluded: [{ reason: "no_textless_member", ordinals: everyone, pairCount: everyone.length - 1 }] };
  }
  const others = ordered.filter((reading) => reading !== textless);
  const hasText = (reading: MemberReading) => reading.readableBoxCount >= textMinReadableBoxes;
  const weak = others.filter((reading) => !hasText(reading));
  return {
    textlessOrdinal: textless.ordinal,
    pairs: others.filter(hasText).map((reading) => ({ textOrdinal: reading.ordinal, textlessOrdinal: textless.ordinal })),
    excluded: weak.length === 0 ? [] : [{ reason: "too_few_readable_boxes", ordinals: weak.map((reading) => reading.ordinal), pairCount: weak.length }],
  };
};

/**
 * OCR check of one cluster. Each member reads its largest difference boxes against the other members and
 * the member with no readable box is the textless one. What was read only decides: it is not kept.
 */
export const confirmCluster = async (client: ReadingClient, members: readonly ClusterMember[]): Promise<TextlessConfirmation> => {
  const ordered = [...members].sort((a, b) => a.ordinal - b.ordinal);
  const differences = differenceBoxes(ordered);
  const readings: MemberReading[] = [];
  for (const [index, member] of ordered.entries()) {
    const boxes = largestDistinctBoxes(differences[index]!);
    readings.push({ ordinal: member.ordinal, readBoxCount: boxes.length, readableBoxCount: await readableBoxCount(client, member, boxes) });
  }
  return { members: readings, ...decideTextless(readings) };
};
