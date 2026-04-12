import type { UploadRecord } from "./upload-record.ts";
import type { UploadSkipItem } from "./upload-skip-item.ts";

/** Result returned after storing one batch of uploaded files. */
export interface UploadBatchResult {
  /** Shared identifier for all files in this batch. */
  uploadId: string;
  /** Every file that was successfully stored to disk. */
  storedRecords: UploadRecord[];
  /** Subset of storedRecords that are eligible for OCR (images and PDFs, not bare ZIPs). */
  ocrReadyRecords: UploadRecord[];
  /** Archive entries that were skipped (unsupported format, extraction error, etc.). */
  skippedEntries: UploadSkipItem[];
}
