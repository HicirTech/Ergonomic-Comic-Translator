import type { OcrJobRecord, UploadRecord } from "../interfaces";
import type { OcrJobRepository, UploadRecordRepository } from "../repositories";
import { nowIso } from "../utils";

export interface OcrUploadLookupResult {
  uploadExists: boolean;
  ocrReadyRecords: UploadRecord[];
  record: OcrJobRecord | null;
}

export const buildOcrReadyRecord = (uploadId: string, createdAt = nowIso()): OcrJobRecord => ({
  uploadId,
  status: "Ready",
  outputFile: null,
  createdAt,
  updatedAt: nowIso(),
  startedAt: null,
  completedAt: null,
  lastError: null,
  pagesCompleted: null,
  pagesTotal: null,
});

export const resolveUploadCreatedAt = (records: UploadRecord[]): string =>
  [...records].map((r) => r.createdAt).sort((a, b) => a.localeCompare(b))[0] ?? nowIso();

export const listOcrReadyUploads = async (
  uploadRepository: UploadRecordRepository,
): Promise<Map<string, UploadRecord[]>> => {
  const uploadRecords = await uploadRepository.list();
  const uploadMap = new Map<string, UploadRecord[]>();
  for (const record of uploadRecords) {
    if (record.sourceType === "zip") continue;
    const existing = uploadMap.get(record.uploadId) ?? [];
    existing.push(record);
    uploadMap.set(record.uploadId, existing);
  }
  return uploadMap;
};

export const getOcrStoredRecordMap = async (
  ocrJobRepository: OcrJobRepository,
): Promise<Map<string, OcrJobRecord>> => {
  const records = await ocrJobRepository.list();
  return new Map(records.map((r) => [r.uploadId, r]));
};

export const lookupOcrUpload = async (
  uploadId: string,
  uploadRepository: UploadRecordRepository,
  ocrJobRepository: OcrJobRepository,
): Promise<OcrUploadLookupResult> => {
  const uploadRecords = await uploadRepository.list();
  const matchingRecords = uploadRecords.filter((r) => r.uploadId === uploadId);
  const ocrReadyRecords = matchingRecords.filter((r) => r.sourceType !== "zip");
  const storedRecordMap = await getOcrStoredRecordMap(ocrJobRepository);
  return {
    uploadExists: matchingRecords.length > 0,
    ocrReadyRecords,
    record: storedRecordMap.get(uploadId) ?? null,
  };
};
