import { normalizeLineAngle } from "../../src/geometry/angle.ts";
import type { Point } from "../../src/geometry/interfaces/index.ts";
import { rectCorners, rotatePoint } from "../../src/geometry/rotated-rect.ts";
import { lineCrop } from "../../src/pipeline/plan-utterances.ts";
import type { TextLine } from "../../src/stages/lines/interfaces/index.ts";
import type { OcrCrop } from "../../src/stages/ocr/interfaces/index.ts";
import { lineRecognizerQuarterTurns } from "./constants.ts";
import type { GroundTruthBlock, Quad } from "./interfaces/index.ts";

const quarterTurns = [0, 1, 2, 3];

/** Layout box after the same rotation placedBlockSvg applies. First edge is the local width. */
export const layoutQuad = (center: Point, width: number, height: number, angle: number): Quad => {
  const halfW = width / 2;
  const halfH = height / 2;
  const corners = [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH },
  ];
  return corners.map((point) => rotatePoint(point, center, angle)) as Quad;
};

/**
 * Line rectangle whose long side is the reading direction: left to right, or top to bottom for a
 * vertical column. rectCorners' first edge is that long side, which is what lineCrop warps onto x.
 */
export const linePolygon = (direction: "h" | "v", center: Point, width: number, height: number, angle: number): Quad => {
  const corners = rectCorners({
    center,
    long: direction === "h" ? width : height,
    short: direction === "h" ? height : width,
    angle: normalizeLineAngle(direction === "h" ? angle : angle + 90),
  });
  return [corners[0], corners[1], corners[2], corners[3]];
};

/** Inverse of linePolygon: the first edge is the long side, so the angle is the reading direction. */
export const rotatedRectFromPolygon = (polygon: Quad) => {
  const [a, b, c, d] = polygon;
  const center = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  const long = Math.hypot(b.x - a.x, b.y - a.y);
  const short = Math.hypot(d.x - a.x, d.y - a.y);
  return { center, long, short, angle: normalizeLineAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) };
};

export const textLineFromPolygon = (polygon: Quad): TextLine => ({
  quad: polygon,
  rect: rotatedRectFromPolygon(polygon),
  score: 1,
  curved: false,
});

/** The pipeline line crop, with all four clockwise quarter turns requested in one recogniser call. */
export const fourTurnLineCrop = (polygon: Quad): OcrCrop => ({
  ...lineCrop(textLineFromPolygon(polygon)),
  quarterTurns: [...quarterTurns],
});

/**
 * Sentence-reader crop of the layout box, at every clockwise quarter turn.
 * planQuarterTurns keeps turn 0 for a clear region, vertical included, so requesting only a
 * labelled turn would blame the readers for a rotation the product never uses.
 */
export const blockCropOf = (block: GroundTruthBlock): OcrCrop => {
  const [origin, across, , down] = block.polygon;
  return {
    corners: block.polygon,
    width: Math.max(1, Math.round(Math.hypot(across.x - origin.x, across.y - origin.y))),
    height: Math.max(1, Math.round(Math.hypot(down.x - origin.x, down.y - origin.y))),
    quarterTurns: [...quarterTurns],
  };
};

export const chosenLineQuarterTurns = lineRecognizerQuarterTurns;
