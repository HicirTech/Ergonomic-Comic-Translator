import type { JobStatus } from "./job-status.ts";

/** Translation state for a single page within a translation job. */
export interface TranslationPageRecord {
  /** 1-based page number matching the OCR output. */
  pageNumber: number;
  /** Whether translation has been attempted and the outcome. */
  status: "pending" | "completed" | "failed";
  /** Error detail if this page failed, or null on success. */
  lastError: string | null;
}

/** Persisted state for one translation job, tracking progress per page. */
export interface TranslationJobRecord {
  /** The upload this job belongs to. */
  uploadId: string;
  /** Current lifecycle state of the overall job. */
  status: JobStatus;
  /** Target language passed to the LLM (e.g. "Chinese", "English"). */
  targetLanguage: string;
  /** Absolute path to the translated.json output file; null until Completed. */
  outputFile: string | null;
  /** Per-page translation records. */
  pages: TranslationPageRecord[];
  /** ISO 8601 timestamp of when the record was first created. */
  createdAt: string;
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string;
  /** ISO 8601 timestamp of when translation began; null if not yet started. */
  startedAt: string | null;
  /** ISO 8601 timestamp of when all pages completed; null if not yet done. */
  completedAt: string | null;
  /** Job-level error if the entire job failed; null otherwise. */
  lastError: string | null;
}
