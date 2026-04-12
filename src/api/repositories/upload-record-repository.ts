import type { UploadRecord } from "../interfaces";

export interface UploadRecordRepository {
  list(): Promise<UploadRecord[]>;
  saveMany(records: UploadRecord[]): Promise<void>;
}
