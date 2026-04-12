import type { ContextJobRecord } from "../interfaces/context-job-record.ts";
import type { ContextJobRepository } from "./context-job-repository.ts";
import { createFileJobRepository } from "./file-job-repository.ts";

export const createFileContextJobRepository = (filePath: string): ContextJobRepository =>
  createFileJobRepository<ContextJobRecord>(filePath, (r) => ({
    ...r,
    chunksCompleted: r.chunksCompleted ?? null,
    chunksTotal: r.chunksTotal ?? null,
  }));
