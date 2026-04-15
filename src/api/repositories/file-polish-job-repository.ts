import type { PolishJobRecord } from "../interfaces";
import type { PolishJobRepository } from "./polish-job-repository.ts";
import { createFileJobRepository } from "./file-job-repository.ts";

export const createFilePolishJobRepository = (filePath: string): PolishJobRepository =>
  createFileJobRepository<PolishJobRecord>(filePath);
