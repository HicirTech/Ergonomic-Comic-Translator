import { boxArea, boxCenter, containsPoint, coverage, intersectionArea, iou, unionBox } from "../../geometry/box.ts";
import type { Box } from "../../geometry/interfaces/index.ts";
import type { Detection } from "../detect/interfaces/index.ts";
import type { CandidateRegion } from "./interfaces/index.ts";

/** Detections below this score are not trusted as regions (spike: 24/24 boxes agree across EPs at 0.5). */
export const regionMinScore = 0.5;
/** Same-class boxes overlapping more than this are one object. */
const sameClassIou = 0.7;
/** A text_bubble and a text_free box overlapping more than this describe the same text. */
const crossClassIou = 0.5;
/** A text box this much inside a bigger one is part of it. */
const containedShare = 0.9;
/** A text box counts as touching a bubble when this share of its area lies inside the bubble. */
const bubbleTouchShare = 0.2;

const suppress = <T extends { box: Box; score: number }>(items: T[], threshold: number) => {
  const kept: T[] = [];
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    if (!kept.some((other) => iou(other.box, item.box) > threshold)) kept.push(item);
  }
  return kept;
};

const touchedBubbles = (box: Box, bubbles: readonly Box[]) =>
  bubbles.flatMap((bubble, index) => (boxArea(box) > 0 && intersectionArea(box, bubble) / boxArea(box) >= bubbleTouchShare ? [index] : []));

/**
 * S3a, first half: cleans detector output into bubbles and text candidates. Removes duplicate boxes
 * within and across text classes, folds boxes contained in bigger ones, and merges several text boxes
 * of the same bubble into one region. Text spanning two or more bubbles keeps all of them in `bubbles`
 * and is split once its lines are known (assignLines).
 */
export const consolidateDetections = (detections: readonly Detection[]) => {
  const trusted = detections.filter((detection) => detection.score >= regionMinScore);
  const bubbles = suppress(trusted.filter((detection) => detection.cls === "bubble"), sameClassIou).map((bubble) => bubble.box);

  const texts = [
    ...suppress(trusted.filter((detection) => detection.cls === "text_bubble"), sameClassIou),
    ...suppress(trusted.filter((detection) => detection.cls === "text_free"), sameClassIou),
  ];
  const inBubble = (box: Box) => bubbles.some((bubble) => containsPoint(bubble, boxCenter(box)));
  const preference = (detection: Detection) => (detection.cls === "text_bubble" && inBubble(detection.box) ? 1 : 0) + detection.score;
  const unique = suppress(texts.map((detection) => ({ ...detection, score: preference(detection), original: detection })), crossClassIou)
    .map((entry) => entry.original);

  // Largest first, so every box can only be folded into one already kept.
  let candidates: CandidateRegion[] = [];
  for (const detection of [...unique].sort((a, b) => boxArea(b.box) - boxArea(a.box))) {
    const host = candidates.find((candidate) => coverage(detection.box, candidate.box) >= containedShare);
    if (host) {
      host.box = unionBox([host.box, detection.box]);
      host.score = Math.max(host.score, detection.score);
      continue;
    }
    candidates.push({
      box: detection.box,
      cls: detection.cls === "text_free" ? "text_free" : "text_bubble",
      score: detection.score,
      bubbles: [],
    });
  }

  for (const candidate of candidates) candidate.bubbles = touchedBubbles(candidate.box, bubbles);

  // Several text boxes inside one bubble are one region.
  const merged: CandidateRegion[] = [];
  const byBubble = new Map<number, CandidateRegion>();
  for (const candidate of candidates) {
    if (candidate.bubbles.length !== 1) {
      merged.push(candidate);
      continue;
    }
    const bubble = candidate.bubbles[0]!;
    const existing = byBubble.get(bubble);
    if (existing) {
      existing.box = unionBox([existing.box, candidate.box]);
      existing.score = Math.max(existing.score, candidate.score);
      if (candidate.cls === "text_bubble") existing.cls = "text_bubble";
      continue;
    }
    byBubble.set(bubble, candidate);
    merged.push(candidate);
  }
  candidates = merged;

  return { bubbles, candidates };
};
