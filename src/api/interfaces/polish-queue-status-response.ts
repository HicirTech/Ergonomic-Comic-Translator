import type { PolishJobRecord } from "./polish-job-record.ts";

export interface PolishQueueStatusResponse {
  activeUploadId: string | null;
  queuedUploadIds: string[];
  records: PolishJobRecord[];
}
