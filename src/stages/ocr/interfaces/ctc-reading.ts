import type { OcrReading } from "./ocr-reading.ts";

/** A CTC reading with the timestep at which each character of `text` was emitted. */
export interface CtcReading extends OcrReading {
  steps: number[];
}
