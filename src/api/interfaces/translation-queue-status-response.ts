import type { TranslationJobRecord } from "./translation-job-record.ts";

/** Response body returned by GET /api/translate describing the current translation queue state. */
export interface TranslationQueueStatusResponse {
  /** The uploadId currently being translated, or null when the queue is idle. */
  activeUploadId: string | null;
  /** Ordered list of uploadIds waiting to be translated. */
  queuedUploadIds: string[];
  /** All known translation job records, sorted by uploadId. */
  records: TranslationJobRecord[];
}
