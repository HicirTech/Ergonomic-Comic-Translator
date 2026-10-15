import type { OcrCandidate } from "./ocr-candidate.ts";

/** A line recogniser's reading, with the offset along the crop, in its pixels, of each character of `text`. */
export interface LineRecognition extends OcrCandidate {
  charOffsets: number[];
}
