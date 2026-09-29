import { rotatePoint } from "../../geometry/rotated-rect.ts";
import type { Box, Point } from "../../geometry/interfaces/index.ts";
import type { OrientedFrame, RegionOrientation } from "../regions/interfaces/index.ts";
import type { OcrCandidate, OcrCrop } from "./interfaces/index.ts";

/** From this tilt on, horizontal and vertical look alike and the other orientation is read too. */
const searchFromTilt = 25;
/** A winner this close to the runner-up is decided by the language prior and flagged ORIENT_UNSURE. */
const unsureMargin = 0.05;
/** Upside-down probability above which the chosen reading is turned 180 degrees. */
const upsideDownThreshold = 0.5;
/** Rectified reading worse than the axis-aligned one by this much mean probability: keep the plain crop. */
const rectifyFallbackMargin = 0.15;
/** Context kept around an utterance crop, relative to its short side. */
const cropMarginShare = 0.2;

/**
 * Page corners of an utterance crop: its box in the region's upright frame, grown by 0.2 of the short
 * side, turned back to the page by the frame angle.
 */
export const utteranceCrop = (frame: OrientedFrame, uprightBox: Box, quarterTurns: number[]): OcrCrop => {
  const margin = cropMarginShare * Math.min(uprightBox.x1 - uprightBox.x0, uprightBox.y1 - uprightBox.y0);
  const box = { x0: uprightBox.x0 - margin, y0: uprightBox.y0 - margin, x1: uprightBox.x1 + margin, y1: uprightBox.y1 + margin };
  const center = { x: frame.cx, y: frame.cy };
  // uprightBox was measured after rotating the page by -frame.angle.
  const toPage = (point: Point) => rotatePoint(point, center, frame.angle);
  const corners: OcrCrop["corners"] = [
    toPage({ x: box.x0, y: box.y0 }),
    toPage({ x: box.x1, y: box.y0 }),
    toPage({ x: box.x1, y: box.y1 }),
    toPage({ x: box.x0, y: box.y1 }),
  ];
  return {
    corners,
    width: Math.max(1, Math.round(box.x1 - box.x0)),
    height: Math.max(1, Math.round(box.y1 - box.y0)),
    quarterTurns,
  };
};

/** Quarter turns to read: the upright crop always; +-90 degrees when geometry cannot tell the direction. */
export const planQuarterTurns = (orientation: RegionOrientation, hasLines: boolean) =>
  !hasLines || orientation.ambiguous || Math.abs(orientation.tilt) >= searchFromTilt ? [0, 1, 3] : [0];

/**
 * Picks the most confident reading. When the best two are within 0.05 mean probability, the reading
 * whose orientation matches the prior (e.g. vertical for Japanese bubbles) wins and the result is unsure.
 */
export const chooseReading = (candidates: readonly OcrCandidate[], preferredQuarterTurns: number) => {
  const ranked = [...candidates].sort((a, b) => b.meanProb - a.meanProb);
  const best = ranked[0];
  if (!best) {
    return null;
  }
  const runnerUp = ranked[1];
  const close = runnerUp !== undefined && best.meanProb - runnerUp.meanProb < unsureMargin;
  if (!close) {
    return { reading: best, unsure: false };
  }
  const preferred = ranked.slice(0, 2).find((candidate) => candidate.quarterTurns === preferredQuarterTurns);
  return { reading: preferred ?? best, unsure: true };
};

/** The winner is read upside down when textline-ori says so; 180 degrees is never part of the blind search. */
export const isUpsideDown = (upsideDownProbability: number) => upsideDownProbability > upsideDownThreshold;

/** Rectification made the reading clearly worse: fall back to the axis-aligned crop (RECTIFY_FALLBACK). */
export const preferAxisAligned = (rectified: OcrCandidate, axisAligned: OcrCandidate) =>
  axisAligned.meanProb - rectified.meanProb > rectifyFallbackMargin;
