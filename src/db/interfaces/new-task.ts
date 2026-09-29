import type { TaskLane } from "./task-lane.ts";

export interface NewTask {
  jobId: string;
  /** null for volume-level stages such as the name glossary. */
  pageId: string | null;
  stage: string;
  lane: TaskLane;
  inputKey?: string | null;
  priority?: number;
}
