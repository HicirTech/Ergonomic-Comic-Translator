import type { Box } from "../../geometry/interfaces/index.ts";
import type { OcrCrop } from "../../stages/ocr/interfaces/index.ts";
import type { UtteranceSplit } from "../../stages/utterances/interfaces/index.ts";

/** An utterance ready for OCR: where it is, how to crop it, and which reader handles it. */
export interface PlannedUtterance {
  regionIndex: number;
  split: UtteranceSplit;
  /** Box in the region's upright frame. */
  box: Box;
  crop: OcrCrop;
  engine: "baberu" | "manga-ocr";
}
