import type { Box } from "../../geometry/interfaces/index.ts";
import type { GrayImage } from "../../imaging/interfaces/index.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import { median } from "../utterances/split-utterances.ts";
import type { LineRecognition, OcrCandidate } from "./interfaces/index.ts";
import { isSplinter } from "./line-reading.ts";

/**
 * The sentence readers squash a crop into a square, so every character of a line shares its side: a line
 * read whole holds at most this many characters, a longer one is read in pieces of at most maxPieceChars.
 */
export const piecesFromChars = 13;
export const maxPieceChars = 9;
/** Across the line, a piece is the detector's rectangle grown by this share of the thickness on each side. */
const pieceMarginShare = 0.15;
/** Edge energy at or below this share of the line's peak is a gap between characters. */
const gapShare = 0.03;
/** A character read together with the one before it: a small kana, a long, iteration or sound mark. */
const clingsToPrevious = /^[ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮヵヶー々ゝゞヽヾ゛゜]$/u;

const charCount = (text: string) => [...text.trim()].length;

/** Characters on a line: the structure reading's count, and at least one per thickness of length. */
export const lineChars = (line: TextLine, structure: OcrCandidate | undefined) =>
  Math.max(charCount(structure?.text ?? ""), Math.round(line.rect.long / line.rect.short));

/** How many pieces a line of `chars` characters is read in. */
export const pieceCount = (chars: number) => (chars >= piecesFromChars ? Math.ceil(chars / maxPieceChars) : 1);

/**
 * Edge energy along the reading axis of an upright line strip: the gray differences to the right and below,
 * summed across the line. Between characters the paper is flat and the energy near zero, whatever the tones
 * of ink, paper and outline.
 */
export const edgeProfile = (strip: GrayImage, mode: "h" | "v"): Float64Array => {
  const profile = new Float64Array(mode === "h" ? strip.width : strip.height);
  for (let y = 0; y + 1 < strip.height; y += 1) {
    for (let x = 0; x + 1 < strip.width; x += 1) {
      const here = strip.data[y * strip.width + x]!;
      const energy = Math.abs(strip.data[y * strip.width + x + 1]! - here) + Math.abs(strip.data[(y + 1) * strip.width + x]! - here);
      profile[mode === "h" ? x : y] += energy;
    }
  }
  return profile;
};

/** Runs of positions whose energy is at most `limit`, as [from, to) pairs. */
const quietRuns = (profile: Float64Array, limit: number) => {
  const runs: { from: number; to: number }[] = [];
  let from = -1;
  for (let at = 0; at <= profile.length; at += 1) {
    const quiet = at < profile.length && profile[at]! <= limit;
    if (quiet && from < 0) from = at;
    if (!quiet && from >= 0) {
      runs.push({ from, to: at });
      from = -1;
    }
  }
  return runs;
};

const quietestNear = (profile: Float64Array, target: number, radius: number) => {
  let best = Math.min(Math.max(1, target), profile.length - 1);
  for (let at = Math.max(1, target - radius); at <= Math.min(profile.length - 1, target + radius); at += 1) {
    if (profile[at]! < profile[best]!) best = at;
  }
  return best;
};

/**
 * Boundaries between the characters a line recogniser found: halfway between neighbours, and where two
 * neighbours stand about n pitches apart (it dropped what lies between) the n boundaries of the cells between
 * them. The boundary before a character that clings to the one before it is left out: on its own, a small
 * kana reads as the large one.
 */
export const characterBoundaries = (recognition: Pick<LineRecognition, "text" | "charOffsets">): number[] => {
  const offsets = recognition.charOffsets;
  const chars = [...recognition.text];
  const labelled = chars.length === offsets.length;
  const spans = offsets.slice(1).map((offset, index) => offset - offsets[index]!);
  if (spans.length === 0) return [];
  const pitch = median(spans);
  return spans.flatMap((span, index) => {
    const cells = Math.max(1, Math.round(span / pitch));
    const boundaries = Array.from({ length: cells }, (_, cell) => offsets[index]! + (span * (cell + 0.5)) / cells);
    return labelled && clingsToPrevious.test(chars[index + 1]!) ? boundaries.slice(0, -1) : boundaries;
  });
};

/** The position nearest `target` among `positions`, within `reach`; null when none is that near. */
const nearestWithin = (positions: readonly number[], target: number, reach: number): number | null => {
  let best: number | null = null;
  for (const at of positions) {
    if (Math.abs(at - target) <= reach && (best === null || Math.abs(at - target) < Math.abs(best - target))) best = at;
  }
  return best;
};

/**
 * Offsets at which to cut a line into `count` pieces of about equal length: near each even share, the
 * closest of the `boundaries` between recognised characters, settled on the quietest place within a
 * quarter pitch; without one within a pitch the middle of the closest gap within a pitch, else the
 * quietest place within half a pitch. A gap alone can lie inside a character (the strokes of い); a
 * boundary between recognised characters cannot.
 */
export const cutOffsets = (profile: Float64Array, boundaries: readonly number[], count: number, pitch: number): number[] => {
  const length = profile.length;
  if (count < 2 || length < 3) return [];
  let peak = 0;
  for (const energy of profile) peak = Math.max(peak, energy);
  const gaps = quietRuns(profile, gapShare * peak).filter((gap) => gap.from > 0 && gap.to < length).map((gap) => (gap.from + gap.to) / 2);
  return Array.from({ length: count - 1 }, (_, index) => {
    const target = Math.round((length * (index + 1)) / count);
    const boundary = nearestWithin(boundaries, target, pitch);
    if (boundary !== null) return quietestNear(profile, Math.round(boundary), Math.round(pitch / 4));
    const gap = nearestWithin(gaps, target, pitch);
    return gap !== null ? Math.round(gap) : quietestNear(profile, target, Math.round(pitch / 2));
  });
};

/**
 * Upright boxes of a line's pieces in reading order: the line box cut at `offsets` from its start along the
 * reading axis, grown across the line by the piece margin.
 */
export const pieceBoxes = (box: Box, mode: "h" | "v", offsets: readonly number[]): Box[] => {
  const horizontal = mode === "h";
  const grow = pieceMarginShare * (horizontal ? box.y1 - box.y0 : box.x1 - box.x0);
  const start = horizontal ? box.x0 : box.y0;
  const edges = [start, ...offsets.map((offset) => start + offset), horizontal ? box.x1 : box.y1];
  return edges.slice(1).map((to, index) => {
    const from = edges[index]!;
    return horizontal
      ? { x0: from, y0: box.y0 - grow, x1: to, y1: box.y1 + grow }
      : { x0: box.x0 - grow, y0: from, x1: box.x1 + grow, y1: to };
  });
};

/**
 * One candidate per quarter turn that every piece was read at: the pieces' texts joined in reading order,
 * the mean probability over all their tokens and the lowest among the pieces that read anything. A piece
 * read as a splinter (a mark or two, unsure) is left out. A single crop's candidates pass through unchanged.
 */
export const joinPieceCandidates = (pieces: readonly (readonly OcrCandidate[])[]): OcrCandidate[] => {
  const lead = pieces[0];
  if (lead === undefined) return [];
  if (pieces.length === 1) return [...lead];
  return lead.flatMap((first) => {
    const parts: OcrCandidate[] = [];
    for (const piece of pieces) {
      const part = piece.find((candidate) => candidate.quarterTurns === first.quarterTurns);
      if (part === undefined) return [];
      if (!isSplinter(part)) parts.push(part);
    }
    const tokens = parts.reduce((sum, part) => sum + part.tokens, 0);
    const read = parts.filter((part) => part.tokens > 0);
    return [{
      quarterTurns: first.quarterTurns,
      text: parts.map((part) => part.text.trim()).join(""),
      meanProb: tokens === 0 ? 0 : parts.reduce((sum, part) => sum + part.meanProb * part.tokens, 0) / tokens,
      minProb: read.length === 0 ? 0 : Math.min(...read.map((part) => part.minProb)),
      tokens,
    }];
  });
};
