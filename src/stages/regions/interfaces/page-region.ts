import type { Box } from "../../../geometry/interfaces/index.ts";
import type { DetectionClass } from "../../detect/interfaces/index.ts";
import type { TextLine } from "../../lines/interfaces/index.ts";

/** A text region with its own lines: the unit that orientation, splitting, OCR and cleaning work on. */
export interface PageRegion {
  box: Box;
  /** null for text the detector missed and the whole-page line scan promoted. */
  cls: Exclude<DetectionClass, "bubble"> | null;
  score: number | null;
  bubble: Box | null;
  lines: TextLine[];
}
