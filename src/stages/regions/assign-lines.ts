import { boundingBoxOfPoints, boxArea, containsPoint, coverage, unionBox } from "../../geometry/box.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import { dedupeLines } from "./dedupe-lines.ts";
import type { CandidateRegion, PageRegion } from "./interfaces/index.ts";

/** A line belongs to the region holding at least this share of its box. */
const lineOwnershipShare = 0.4;
/** A text box left without a line shows text of other regions when this share of it lies under their lines. */
const duplicateTextShare = 0.5;

export const lineBox = (line: TextLine) => boundingBoxOfPoints(line.quad);

const regionFrom = (candidate: CandidateRegion, bubble: Box | null, lines: TextLine[]): PageRegion => ({
  box: lines.length > 0 ? unionBox([candidate.box, ...lines.map(lineBox)]) : candidate.box,
  cls: candidate.cls,
  score: candidate.score,
  bubble,
  lines,
});

/**
 * S3a, second half: gives every text line to exactly one region, splits a text box that spans several
 * bubbles into one region per bubble, and returns lines outside all regions as candidates the detector
 * missed. `cropLines[i]` are the lines found in candidate i's crop; `pageLines` come from the whole-page
 * scan (may be empty). Uncovered candidates are only promoted to regions after the OCR gate.
 * A text box whose lines all went to other regions is the same text detected twice and gives no region:
 * as a region it would be read and lettered a second time, on top of the first.
 */
export const assignLines = (
  candidates: readonly CandidateRegion[],
  bubbles: readonly Box[],
  cropLines: readonly TextLine[][],
  pageLines: readonly TextLine[],
) => {
  const owned = new Map<number, TextLine[]>();
  const uncovered: TextLine[] = [];
  for (const line of dedupeLines([...cropLines.flat(), ...pageLines])) {
    const box = lineBox(line);
    let best = -1;
    let bestShare = 0;
    candidates.forEach((candidate, index) => {
      const share = coverage(box, candidate.box);
      if (share > bestShare) {
        best = index;
        bestShare = share;
      }
    });
    if (best >= 0 && bestShare >= lineOwnershipShare) {
      owned.set(best, [...(owned.get(best) ?? []), line]);
    } else if (boxArea(box) > 0) {
      uncovered.push(line);
    }
  }

  /** Share of a candidate's box under the lines of the other candidates. */
  const underOtherLines = (index: number) => {
    let share = 0;
    for (const [owner, lines] of owned) {
      if (owner !== index) for (const line of lines) share += coverage(candidates[index]!.box, lineBox(line));
    }
    return share;
  };

  const regions: PageRegion[] = [];
  candidates.forEach((candidate, index) => {
    const lines = owned.get(index) ?? [];
    if (lines.length === 0 && underOtherLines(index) >= duplicateTextShare) return;
    if (candidate.bubbles.length <= 1) {
      regions.push(regionFrom(candidate, candidate.bubbles.length === 1 ? bubbles[candidate.bubbles[0]!]! : null, lines));
      return;
    }
    // One detector box over several bubbles: one region per bubble that received lines.
    const perBubble = new Map<number, TextLine[]>();
    const outside: TextLine[] = [];
    for (const line of lines) {
      const center = line.rect.center;
      const bubble = candidate.bubbles.find((bubbleIndex) => containsPoint(bubbles[bubbleIndex]!, center));
      if (bubble === undefined) outside.push(line);
      else perBubble.set(bubble, [...(perBubble.get(bubble) ?? []), line]);
    }
    for (const [bubble, bubbleLines] of perBubble) {
      const box = unionBox(bubbleLines.map(lineBox));
      regions.push({ box, cls: "text_bubble", score: candidate.score, bubble: bubbles[bubble]!, lines: bubbleLines });
    }
    if (outside.length > 0 || perBubble.size === 0) {
      regions.push(regionFrom({ ...candidate, cls: "text_free" }, null, outside));
    }
  });
  return { regions, uncovered };
};
