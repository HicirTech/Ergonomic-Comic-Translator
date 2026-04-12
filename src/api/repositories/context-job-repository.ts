import type { ContextJobRecord } from "../interfaces/context-job-record.ts";
import type { JobRepository } from "./file-job-repository.ts";

export type ContextJobRepository = JobRepository<ContextJobRecord>;
