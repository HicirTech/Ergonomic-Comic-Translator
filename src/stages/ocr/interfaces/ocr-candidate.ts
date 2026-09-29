import type { OcrReading } from "./ocr-reading.ts";

/** One reading of a crop at one rotation. */
export interface OcrCandidate extends OcrReading {
  quarterTurns: number;
}
