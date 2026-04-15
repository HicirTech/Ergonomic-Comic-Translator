import type { JobStatus } from "./job-status.ts";

/** Polishing state for a single page within a polish job. */
export interface PolishPageRecord {
  /** 1-based page number matching the translation output. */
  pageNumber: number;
  /** Whether polishing has been attempted and the outcome. */
  status: "pending" | "completed" | "failed";
  /** Error detail if this page failed, or null on success. */
  lastError: string | null;
}

/** Persisted state for one polish job, tracking progress per page. */
export interface PolishJobRecord {
  /** The upload this job belongs to. */
  uploadId: string;
  /** Current lifecycle state of the overall job. */
  status: JobStatus;
  /** Target language used for polishing context. */
  targetLanguage: string;
  /** Absolute path to the translated.json output file; null until Completed. */
  outputFile: string | null;
  /** Per-page polishing records. */
  pages: PolishPageRecord[];
  /** ISO 8601 timestamp of when the record was first created. */
  createdAt: string;
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string;
  /** ISO 8601 timestamp of when polishing began; null if not yet started. */
  startedAt: string | null;
  /** ISO 8601 timestamp of when polishing finished; null if not yet done. */
  completedAt: string | null;
  /** Last error message, if any. */
  lastError: string | null;
}
