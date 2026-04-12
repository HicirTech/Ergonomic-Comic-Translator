import type { JobStatus } from "./job-status.ts";

/** A single glossary term with optional user-supplied context/explanation. */
export interface ContextTerm {
  /** The original term as detected by the AI. */
  term: string;
  /** User-provided explanation/context; empty string if not yet provided. */
  context: string;
}

/** Persisted state for one context-detection job. */
export interface ContextJobRecord {
  uploadId: string;
  status: JobStatus;
  /** Pages that were analysed; null = all pages. */
  pageNumbers: number[] | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  /** Number of chunks completed so far (null when not running). */
  chunksCompleted: number | null;
  /** Total number of chunks for this job (null when not running). */
  chunksTotal: number | null;
}
