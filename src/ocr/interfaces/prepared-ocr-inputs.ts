import type { PreparedOcrJob } from "./prepared-ocr-job.ts";

/** Collection of prepared OCR jobs returned by the preparation step. */
export interface PreparedOcrInputs {
  /** All page-level jobs ready to be dispatched to the OCR engine. */
  jobs: PreparedOcrJob[];
}
