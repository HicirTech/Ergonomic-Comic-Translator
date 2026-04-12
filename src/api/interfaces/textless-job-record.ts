import type { JobStatus } from "./job-status.ts";

/** Processing state for a single page within a textless job. */
export interface TextlessPageRecord {
  /** 1-based page number matching the OCR output. */
  pageNumber: number;
  /** File name of the source image for this page. */
  fileName: string;
  /** Whether text removal has been attempted and the outcome. */
  status: "pending" | "completed" | "failed";
  /** Error detail if this page failed, or null on success. */
  lastError: string | null;
}

/** Persisted state for one textless job, tracking progress per page. */
export interface TextlessJobRecord {
  /** The upload this job belongs to. */
  uploadId: string;
  /** Current lifecycle state of the overall job. */
  status: JobStatus;
  /** Per-page processing records. */
  pages: TextlessPageRecord[];
  /** ISO 8601 timestamp of when the record was first created. */
  createdAt: string;
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string;
  /** ISO 8601 timestamp of when processing began; null if not yet started. */
  startedAt: string | null;
  /** ISO 8601 timestamp of when all pages completed; null if not yet done. */
  completedAt: string | null;
  /** Job-level error if the entire job failed; null otherwise. */
  lastError: string | null;
}
