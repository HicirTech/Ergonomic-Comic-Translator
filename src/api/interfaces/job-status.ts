/** Lifecycle state of a queue job, progressing forward: Ready → Queued → Processing → Completed. */
export type JobStatus = "Ready" | "Queued" | "Processing" | "Completed";
