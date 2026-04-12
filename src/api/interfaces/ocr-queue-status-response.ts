import type { OcrJobRecord } from "./ocr-job-record.ts";

/** Response body returned by GET /api/ocr describing the current OCR queue state. */
export interface OcrQueueStatusResponse {
  /** The uploadId currently being processed, or null when the queue is idle. */
  activeUploadId: string | null;
  /** Ordered list of uploadIds waiting to be processed. */
  queuedUploadIds: string[];
  /** All known OCR job records, sorted by uploadId. */
  records: OcrJobRecord[];
}