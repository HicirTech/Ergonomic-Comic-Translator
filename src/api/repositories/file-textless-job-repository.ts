import type { TextlessJobRecord } from "../interfaces";
import type { TextlessJobRepository } from "./textless-job-repository.ts";
import { createFileJobRepository } from "./file-job-repository.ts";

export const createFileTextlessJobRepository = (filePath: string): TextlessJobRepository =>
  createFileJobRepository<TextlessJobRecord>(filePath);
