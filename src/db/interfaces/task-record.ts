import type { TaskLane } from "./task-lane.ts";
import type { TaskState } from "./task-state.ts";

export interface TaskRecord {
  id: string;
  job_id: string;
  page_id: string | null;
  stage: string;
  lane: TaskLane;
  input_key: string | null;
  output_key: string | null;
  state: TaskState;
  attempts: number;
  preempts: number;
  priority: number;
  error_code: string | null;
  error_msg_zh: string | null;
  started_at: string | null;
  finished_at: string | null;
}
