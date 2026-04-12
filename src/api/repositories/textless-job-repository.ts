import type { TextlessJobRecord } from "../interfaces";
import type { JobRepository } from "./file-job-repository.ts";

export type TextlessJobRepository = JobRepository<TextlessJobRecord>;
