/** A job with the state the job_state view derives from its tasks. */
export interface JobSummary {
  job_id: string;
  volume_id: string;
  kind: string;
  created_at: string;
  cancel_requested_at: string | null;
  tasks: number;
  done: number;
  failed: number;
  state: "queued" | "running" | "cancelling" | "partial_failed" | "cancelled" | "needs_review" | "succeeded";
}
