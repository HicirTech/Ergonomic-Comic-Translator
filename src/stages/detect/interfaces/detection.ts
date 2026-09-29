import type { Box } from "../../../geometry/interfaces/index.ts";
import type { DetectionClass } from "./detection-class.ts";

export interface Detection {
  cls: DetectionClass;
  score: number;
  /** Page pixels, clamped to the image. */
  box: Box;
}
