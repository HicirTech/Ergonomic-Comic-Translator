import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { UploadRecord } from "../interfaces";
import type { UploadRecordRepository } from "./upload-record-repository.ts";

export const createFileUploadRecordRepository = (filePath: string): UploadRecordRepository => {
  const list = async (): Promise<UploadRecord[]> => {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, "utf8");
    if (!content.trim()) return [];
    return JSON.parse(content) as UploadRecord[];
  };

  const saveMany = async (records: UploadRecord[]): Promise<void> => {
    const existingRecords = await list();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify([...existingRecords, ...records], null, 2), "utf8");
  };

  return { list, saveMany };
};
