import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export interface JobRepository<T extends { uploadId: string }> {
  list(): Promise<T[]>;
  upsert(record: T): Promise<void>;
  upsertMany(records: T[]): Promise<void>;
}

export const createFileJobRepository = <T extends { uploadId: string }>(
  filePath: string,
  backfill?: (record: T) => T,
): JobRepository<T> => {
  const list = async (): Promise<T[]> => {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, "utf8");
    if (!content.trim()) return [];
    const records = JSON.parse(content) as T[];
    return backfill ? records.map(backfill) : records;
  };

  const upsertMany = async (records: T[]): Promise<void> => {
    const existingRecords = await list();
    const recordMap = new Map(existingRecords.map((item) => [item.uploadId, item]));
    for (const record of records) recordMap.set(record.uploadId, record);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify([...recordMap.values()], null, 2), "utf8");
  };

  const upsert = (record: T) => upsertMany([record]);

  return { list, upsert, upsertMany };
};
