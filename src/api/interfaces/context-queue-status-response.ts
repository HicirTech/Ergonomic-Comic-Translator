import type { ContextJobRecord } from "./context-job-record.ts";

export interface ContextQueueStatusResponse {
  activeUploadId: string | null;
  queuedUploadIds: string[];
  records: ContextJobRecord[];
}
