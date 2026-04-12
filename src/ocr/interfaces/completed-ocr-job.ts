import type { OcrOutput } from "./ocr-output.ts";
import type { PreparedOcrJob } from "./prepared-ocr-job.ts";

/** Pairs a prepared OCR job with the output produced by running inference on it. */
export interface CompletedOcrJob {
  /** The prepared job descriptor used to locate the input image. */
  job: PreparedOcrJob;
  /** The OCR output produced by this job (covers this page only before merge). */
  output: OcrOutput;
}
