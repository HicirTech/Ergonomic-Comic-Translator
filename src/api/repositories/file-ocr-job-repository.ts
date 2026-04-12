import type { OcrJobRecord } from "../interfaces";
import type { OcrJobRepository } from "./ocr-job-repository.ts";
import { createFileJobRepository } from "./file-job-repository.ts";

export const createFileOcrJobRepository = (filePath: string): OcrJobRepository =>
  createFileJobRepository<OcrJobRecord>(filePath, (r) => ({
    ...r,
    pagesCompleted: r.pagesCompleted ?? null,
    pagesTotal: r.pagesTotal ?? null,
  }));
