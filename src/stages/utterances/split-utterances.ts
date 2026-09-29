import { boundingBoxOfPoints } from "../../geometry/box.ts";
import { rotatePoint } from "../../geometry/rotated-rect.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import type { OrientedFrame } from "../regions/interfaces/index.ts";
import type { CutReason, UtteranceLine, UtteranceSplit } from "./interfaces/index.ts";

/**
 * Thresholds of the v3c rules measured on the benchmark volume (spike-multispeaker): the line gap
 * split 15/15 held-out multi-speaker bubbles correctly; size-only cuts were right 2/6 and colour-only
 * 0/4, so size is a soft style break and colour is not used for splitting.
 */
const gapShare = 0.3;
const sizeJumpWithOcr = 1.4;
const sizeJumpWithoutOcr = 1.5;
const trustedConf = 0.8;
const fragmentLengthShare = 1.5;

const openBracket = /^[「『（(【［〈《“"]/u;
const closeBracket = /[」』）)】］〉》”"]$/u;
const sentenceEnd = /[。．！？!?…‥♡♥～〜」』）)]$/u;
const nameBracket = /^【[^】]{1,10}】$/u;
const nameColon = /^[^「『（(]{1,8}[：:]$/u;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Axis adapter: horizontal lines stack downwards; vertical columns stack right to left. */
const axisFor = (mode: "h" | "v") =>
  mode === "h"
    ? { thickness: (box: Box) => box.y1 - box.y0, length: (box: Box) => box.x1 - box.x0, low: (box: Box) => box.y0, high: (box: Box) => box.y1 }
    : { thickness: (box: Box) => box.x1 - box.x0, length: (box: Box) => box.y1 - box.y0, low: (box: Box) => -box.x1, high: (box: Box) => -box.x0 };

const bracketDelta = (text: string) =>
  (text.match(/[「『（(【]/gu)?.length ?? 0) - (text.match(/[」』）)】]/gu)?.length ?? 0);

const isNameTag = (text: string) => nameBracket.test(text) || nameColon.test(text);

/** Lines in the region's upright frame, in reading order (top to bottom, or right to left for columns). */
export const toUtteranceLines = (lines: readonly TextLine[], frame: OrientedFrame, mode: "h" | "v"): { line: TextLine; box: Box }[] => {
  const center = { x: frame.cx, y: frame.cy };
  const upright = lines.map((line) => ({ line, box: boundingBoxOfPoints(line.quad.map((point) => rotatePoint(point, center, -frame.angle))) }));
  return upright.sort((a, b) => (mode === "h" ? a.box.y0 + a.box.y1 - (b.box.y0 + b.box.y1) : b.box.x0 + b.box.x1 - (a.box.x0 + a.box.x1)));
};

/**
 * S3b: splits one region's lines (already in reading order) into utterances. Only hard evidence cuts;
 * everything else is left to the translation model, which sees the lines together with the context.
 */
export const splitUtterances = (lines: readonly UtteranceLine[], mode: "h" | "v"): UtteranceSplit[] => {
  if (lines.length === 0) {
    return [];
  }
  const axis = axisFor(mode);
  const thicknessMedian = median(lines.map((line) => axis.thickness(line.box)));
  const trusted = (line: UtteranceLine) => line.conf >= trustedConf;
  const chars = (line: UtteranceLine) => [...line.text.trim()].length;
  // Stray punctuation and DB splinters never cut.
  const fragment = (line: UtteranceLine) =>
    axis.length(line.box) < fragmentLengthShare * thicknessMedian && chars(line) <= 2 && !isNameTag(line.text.trim());

  const considered = lines.map((_, index) => index).filter((index) => !fragment(lines[index]!));
  const cuts = new Map<number, CutReason[]>();
  const styleBreaks = new Set<number>();
  let depth = 0;

  considered.forEach((index, position) => {
    const next = considered[position + 1];
    if (next === undefined) return;
    const a = lines[index]!;
    const b = lines[next]!;
    const textA = a.text.trim();
    const textB = b.text.trim();
    if (trusted(a)) depth = Math.max(0, depth + bracketDelta(textA));

    const hard: CutReason[] = [];
    if (trusted(b) && isNameTag(textB)) hard.push("name_tag");
    if (position === 0 && trusted(a) && isNameTag(textA)) hard.push("name_tag");
    if (depth === 0) {
      if (trusted(a) && trusted(b) && closeBracket.test(textA) && openBracket.test(textB)) hard.push("close_open");
      else if (trusted(b) && openBracket.test(textB) && (!trusted(a) || sentenceEnd.test(textA))) hard.push("open_after_terminal");
      if ((axis.low(b.box) - axis.high(a.box)) / thicknessMedian >= gapShare) hard.push("gap");
    }

    const thicknessRatio = Math.max(axis.thickness(a.box), axis.thickness(b.box)) / Math.min(axis.thickness(a.box), axis.thickness(b.box));
    const bothRead = trusted(a) && trusted(b) && chars(a) >= 3 && chars(b) >= 3;
    const advanceRatio = bothRead
      ? Math.max(axis.length(a.box) / chars(a), axis.length(b.box) / chars(b)) / Math.min(axis.length(a.box) / chars(a), axis.length(b.box) / chars(b))
      : 0;
    const sizeJump = bothRead ? thicknessRatio >= sizeJumpWithOcr && advanceRatio >= sizeJumpWithOcr : thicknessRatio >= sizeJumpWithoutOcr;

    if (hard.length > 0) {
      cuts.set(next, [...new Set(hard)]);
    } else if (sizeJump) {
      styleBreaks.add(next);
    }
  });

  const starts = [0, ...[...cuts.keys()].sort((a, b) => a - b)];
  return starts.map((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1]! : lines.length;
    const members = Array.from({ length: end - start }, (_, offset) => start + offset);
    const text = members.map((index) => lines[index]!.text.trim()).join("");
    const allTrusted = members.every((index) => trusted(lines[index]!));
    return {
      lines: members,
      startReasons: cuts.get(start) ?? [],
      styleBreaks: members.filter((index) => styleBreaks.has(index)),
      nameTag: allTrusted && members.length === 1 && isNameTag(text),
      thought: allTrusted && /^[（(].*[）)]$/su.test(text),
    };
  });
};
