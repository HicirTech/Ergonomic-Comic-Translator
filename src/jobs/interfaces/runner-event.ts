import type { JobSummary } from "../../db/interfaces/job-summary.ts";
import type { TaskState } from "../../db/interfaces/task-state.ts";

/** Progress the runner reports to the UI (over SSE); ids, stages and Chinese status text only. */
export type RunnerEvent =
  | {
    type: "task";
    jobId: string;
    volumeId: string;
    stage: string;
    /** null for volume-level stages. */
    pageOrdinal: number | null;
    state: TaskState;
  }
  | { type: "job"; job: JobSummary }
  | {
    type: "models";
    /** The lane being loaded or waited for; null once nothing is loaded. */
    lane: "gpu" | "llm" | null;
    state: "loading" | "loaded" | "waiting" | "unloaded";
    messageZh: string;
  };
