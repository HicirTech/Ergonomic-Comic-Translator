import type { TranslationJobRecord } from "../interfaces";
import type { TranslationJobRepository } from "./translation-job-repository.ts";
import { createFileJobRepository } from "./file-job-repository.ts";

export const createFileTranslationJobRepository = (filePath: string): TranslationJobRepository =>
  createFileJobRepository<TranslationJobRecord>(filePath);
