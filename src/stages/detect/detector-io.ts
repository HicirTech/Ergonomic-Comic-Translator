import type { Detection, DetectionClass } from "./interfaces/index.ts";

/** The exported detector expects a fixed 640 x 640 input: keeping one shape avoids DirectML recompiles. */
export const detectorInputSize = 640;

const classes: readonly DetectionClass[] = ["bubble", "text_bubble", "text_free"];

/**
 * Decodes the RT-DETR outputs. The model already maps boxes back to original pixels through the
 * `orig_target_sizes` input, so only clamping to the page remains.
 */
export const decodeDetections = (
  labels: ArrayLike<bigint | number>,
  boxes: ArrayLike<number>,
  scores: ArrayLike<number>,
  width: number,
  height: number,
  minScore: number,
): Detection[] => {
  const detections: Detection[] = [];
  for (let index = 0; index < scores.length; index += 1) {
    const score = scores[index]!;
    const cls = classes[Number(labels[index])];
    if (score < minScore || !cls) continue;
    const x0 = Math.max(0, Math.min(width, boxes[index * 4]!));
    const y0 = Math.max(0, Math.min(height, boxes[index * 4 + 1]!));
    const x1 = Math.max(0, Math.min(width, boxes[index * 4 + 2]!));
    const y1 = Math.max(0, Math.min(height, boxes[index * 4 + 3]!));
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;
    detections.push({ cls, score, box: { x0, y0, x1, y1 } });
  }
  return detections.sort((a, b) => b.score - a.score);
};
