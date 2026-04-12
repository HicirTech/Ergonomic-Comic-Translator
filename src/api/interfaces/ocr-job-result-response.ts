import type { OcrJobRecord } from "./ocr-job-record.ts";
import type { OcrOutput } from "../../ocr/interfaces";

/** Response body returned by GET /api/ocr/:uploadId for a completed job. */
export interface OcrJobResultResponse {
  /** The persisted OCR job record. */
  record: OcrJobRecord;
  /** The parsed OCR output read from disk. */
  output: OcrOutput;
}