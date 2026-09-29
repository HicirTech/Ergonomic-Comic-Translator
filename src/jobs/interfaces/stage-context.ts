import type { PageRecord, TaskRecord, VolumeRecord } from "../../db/interfaces/index.ts";

export interface StageContext {
  task: TaskRecord;
  volume: VolumeRecord;
  pages: readonly PageRecord[];
  /** The task's page; null for volume-level stages. */
  page: PageRecord | null;
}
