import type { JobStatus } from "./job-status.ts";

/** Persisted state for one OCR job, keyed by uploadId. */
export interface OcrJobRecord {
  /** The upload this job belongs to. */
  uploadId: string;
  /** Current lifecycle state. */
  status: JobStatus;
  /** Absolute path to the merged ocr_output.json file; null until Completed. */
  outputFile: string | null;
  /** ISO 8601 timestamp of when the record was first created. */
  createdAt: string;
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string;
  /** ISO 8601 timestamp of when OCR processing began; null if not yet started. */
  startedAt: string | null;
  /** ISO 8601 timestamp of when OCR completed successfully; null if not yet complete. */
  completedAt: string | null;
  /** Last error message recorded on failure, or null when no error has occurred. */
  lastError: string | null;
  /** Number of pages that have been OCR'd so far; null if not yet started. */
  pagesCompleted: number | null;
  /** Total number of pages to OCR; null if not yet known. */
  pagesTotal: number | null;
}