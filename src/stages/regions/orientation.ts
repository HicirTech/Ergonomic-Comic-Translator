import { lineAngleDistance, lineFamily, meanTilt } from "../../geometry/angle.ts";
import type { Box, Point } from "../../geometry/interfaces/index.ts";
import type { TextLine } from "../lines/interfaces/index.ts";
import type { OrientedFrame, RegionOrientation } from "./interfaces/index.ts";

/** Below this length/thickness ratio a line (1-3 characters) says nothing reliable about its direction. */
const elongatedRatio = 1.5;
/** Around 45 degrees horizontal and vertical lines look the same; OCR must try both. */
const ambiguousTilt = 25;
/** Lines whose directions differ by more than this belong to different text groups. */
const clusterSpread = 15;
/**
 * Up to this tilt the frame stays axis-aligned: OCR error is 0 up to 10-20 degrees without rectification,
 * so 5 leaves margin and keeps upright text byte-for-byte on the unrotated path.
 */
export const rectifyAboveTilt = 5;

const degrees = 180 / Math.PI;

const isElongated = (line: TextLine) => line.rect.long >= elongatedRatio * line.rect.short;

/** Smallest frame rotated by `angle` that holds all points. */
export const frameAround = (points: readonly Point[], angle: number): OrientedFrame => {
  const radians = angle / degrees;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const point of points) {
    const along = point.x * ux + point.y * uy;
    const across = -point.x * uy + point.y * ux;
    a0 = Math.min(a0, along);
    a1 = Math.max(a1, along);
    b0 = Math.min(b0, across);
    b1 = Math.max(b1, across);
  }
  const along = (a0 + a1) / 2;
  const across = (b0 + b1) / 2;
  return { cx: along * ux - across * uy, cy: along * uy + across * ux, w: a1 - a0, h: b1 - b0, angle };
};

/**
 * S3c-1: region tilt as the length-weighted doubled-angle mean of its line tilts, writing mode as the
 * length-weighted majority of elongated lines, and the oriented frame the lines occupy.
 */
export const estimateOrientation = (lines: readonly TextLine[], fallback: Box): RegionOrientation => {
  if (lines.length === 0) {
    return {
      tilt: 0,
      consistency: 0,
      writingMode: null,
      ambiguous: true,
      frame: { cx: (fallback.x0 + fallback.x1) / 2, cy: (fallback.y0 + fallback.y1) / 2, w: fallback.x1 - fallback.x0, h: fallback.y1 - fallback.y0, angle: 0 },
    };
  }
  const elongated = lines.filter(isElongated);
  const voters = elongated.length > 0 ? elongated : lines;
  const families = voters.map((line) => ({ ...lineFamily(line.rect.angle), weight: line.rect.long }));

  let horizontal = 0;
  let vertical = 0;
  for (const entry of families) {
    if (entry.family === "h") horizontal += entry.weight;
    else vertical += entry.weight;
  }
  const writingMode = elongated.length === 0 ? null : horizontal >= vertical ? "h" : "v";
  const { tilt, consistency } = meanTilt(families.map((entry) => ({ tilt: entry.tilt, weight: entry.weight })));
  // meanTilt normalises to (-90, 90]; residual tilts are within (-45, 45] by construction.
  const residual = tilt > 45 ? tilt - 90 : tilt <= -45 ? tilt + 90 : tilt;

  return {
    tilt: residual,
    consistency,
    writingMode,
    ambiguous: writingMode === null || Math.abs(residual) >= ambiguousTilt,
    frame: frameAround(lines.flatMap((line) => line.quad), Math.abs(residual) > rectifyAboveTilt ? residual : 0),
  };
};

/**
 * Splits a region's lines into groups of consistent direction (e.g. a tilted caption next to upright
 * dialogue in one detector box). Short lines, whose angle is unreliable, join the largest group.
 */
export const groupByDirection = (lines: readonly TextLine[]): TextLine[][] => {
  const groups: { angle: number; lines: TextLine[]; length: number }[] = [];
  const elongated = lines.filter(isElongated).sort((a, b) => b.rect.long - a.rect.long);
  for (const line of elongated) {
    const group = groups.find((candidate) => lineAngleDistance(candidate.angle, line.rect.angle) <= clusterSpread);
    if (group) {
      group.lines.push(line);
      group.length += line.rect.long;
    } else {
      groups.push({ angle: line.rect.angle, lines: [line], length: line.rect.long });
    }
  }
  const shortLines = lines.filter((line) => !isElongated(line));
  if (groups.length === 0) {
    return shortLines.length > 0 ? [shortLines] : [];
  }
  groups.sort((a, b) => b.length - a.length);
  groups[0]!.lines.push(...shortLines);
  return groups.map((group) => group.lines);
};
