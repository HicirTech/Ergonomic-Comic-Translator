import type { TextlessJobRecord } from "./textless-job-record.ts";

/** Response body returned by GET /api/textless describing the current textless queue state. */
export interface TextlessQueueStatusResponse {
  /** The uploadId currently having text removed, or null when the queue is idle. */
  activeUploadId: string | null;
  /** Ordered list of uploadIds waiting to be processed. */
  queuedUploadIds: string[];
  /** All known textless job records, sorted by uploadId. */
  records: TextlessJobRecord[];
}
