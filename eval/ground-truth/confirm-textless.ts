import { boxArea, coverage } from "../../src/geometry/box.ts";
import type { Box } from "../../src/geometry/interfaces/index.ts";
import type { VisionClient } from "../../src/pipeline/interfaces/index.ts";
import type { OcrCandidate, OcrCrop } from "../../src/stages/ocr/interfaces/index.ts";
import type { ClusterMember, ClusterReading, ConfirmedPair, MemberReading, PairDifference, TextlessConfirmation } from "./interfaces/index.ts";
import { deriveTextAreasFromFiltered, differenceParameters, median3x3 } from "./textless-diff.ts";

/** Difference boxes read per page: the largest ones, where a dialogue box or a caption would sit. */
export const readBoxLimit = 8;
/** A reading counts as text when its mean token probability reaches this ... */
export const readableMinProb = 0.8;
/** ... and it holds at least this many characters other than white space. */
export const readableMinChars = 2;
/** A textless page has no box that reads as text; every other member is a text page, a single dialogue box included. */
export const textlessMaxReadableBoxes = 0;
/**
 * A text page pairs with its closest textless page only when the two differ in at most this share of the
 * page. A game-style dialogue box covers up to about a quarter of a CG page; a variant with another
 * expression or pose differs in much more, and its difference would count the art as text.
 */
export const maxPairDifferenceShare = 0.3;
/** A box with this share inside a larger kept box is the same area, found again in another page difference. */
const duplicateCoverage = 0.5;
/** The line recognizer reads horizontal text upright (turn 0) and vertical text turned counter-clockwise (turn 3). */
const lineRecognizerTurns = [0, 3];
const mangaOcrTurns = [0];

/** Everything besides the pages and the recognizer models that changes a member's reading. */
export const readingParameters = {
  readBoxLimit,
  readableMinProb,
  readableMinChars,
  duplicateCoverage,
  lineRecognizerTurns,
  mangaOcrTurns,
  ...differenceParameters,
} as const;

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

/**
 * Per member, the difference boxes against every other member (a pair's boxes are the same seen from either
 * page), and for every two members the share of the page they differ in. Members ascend by ordinal.
 */
const compareMembers = (members: readonly ClusterMember[]) => {
  const boxes = members.map((): Box[] => []);
  const differences: PairDifference[] = [];
  const filtered = members.map((member) => median3x3(member.image));
  for (let left = 0; left < members.length; left += 1) {
    for (let right = left + 1; right < members.length; right += 1) {
      const areas = deriveTextAreasFromFiltered(filtered[left]!, filtered[right]!);
      boxes[left]!.push(...areas.boxes);
      boxes[right]!.push(...areas.boxes);
      const marked = areas.mask.reduce((sum, value) => sum + value, 0);
      differences.push({ first: members[left]!.ordinal, second: members[right]!.ordinal, share: marked / areas.mask.length });
    }
  }
  return { boxes, differences };
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
 * Members with no readable box are textless; every other member is a text page. A cluster can hold several
 * pictures (CG variants), so each text page pairs with the textless member whose picture is closest, the
 * smallest difference share (a tie goes to the later page, as CG volumes append their textless copies), and
 * only when that difference stays within maxPairDifferenceShare.
 */
export const decideTextless = (reading: ClusterReading): Omit<TextlessConfirmation, "members"> => {
  const ordered = [...reading.members].sort((a, b) => a.ordinal - b.ordinal);
  const textless = ordered.filter((member) => member.readableBoxCount <= textlessMaxReadableBoxes).map((member) => member.ordinal);
  const text = ordered.filter((member) => member.readableBoxCount > textlessMaxReadableBoxes).map((member) => member.ordinal);
  if (textless.length === 0) {
    return { textlessOrdinals: [], pairs: [], excluded: text.length === 0 ? [] : [{ reason: "no_textless_member", ordinals: text, pairCount: text.length }] };
  }
  const shareOf = (a: number, b: number) =>
    reading.differences.find((difference) => (difference.first === a && difference.second === b) || (difference.first === b && difference.second === a))?.share ?? 1;
  const pairs: ConfirmedPair[] = [];
  const differs: number[] = [];
  for (const ordinal of text) {
    const closest = textless.reduce((best, candidate) => (shareOf(ordinal, candidate) <= shareOf(ordinal, best) ? candidate : best));
    const share = shareOf(ordinal, closest);
    if (share <= maxPairDifferenceShare) pairs.push({ textOrdinal: ordinal, textlessOrdinal: closest, differenceShare: share });
    else differs.push(ordinal);
  }
  return {
    textlessOrdinals: textless,
    pairs,
    excluded: differs.length === 0 ? [] : [{ reason: "picture_differs", ordinals: differs, pairCount: differs.length }],
  };
};

/**
 * The expensive half of the OCR check: each member reads its largest difference boxes against the other
 * members, and every two members are compared. What was read only counts: the text is not kept.
 */
export const readCluster = async (client: ReadingClient, members: readonly ClusterMember[]): Promise<ClusterReading> => {
  const ordered = [...members].sort((a, b) => a.ordinal - b.ordinal);
  const { boxes, differences } = compareMembers(ordered);
  const readings: MemberReading[] = [];
  for (const [index, member] of ordered.entries()) {
    const largest = largestDistinctBoxes(boxes[index]!);
    readings.push({ ordinal: member.ordinal, readBoxCount: largest.length, readableBoxCount: await readableBoxCount(client, member, largest) });
  }
  return { members: readings, differences };
};

/** The decision for one cluster from what readCluster measured. */
export const confirmationOf = (reading: ClusterReading): TextlessConfirmation => ({
  members: [...reading.members].sort((a, b) => a.ordinal - b.ordinal),
  ...decideTextless(reading),
});

/** OCR check of one cluster: readCluster, then confirmationOf. */
export const confirmCluster = async (client: ReadingClient, members: readonly ClusterMember[]): Promise<TextlessConfirmation> =>
  confirmationOf(await readCluster(client, members));
