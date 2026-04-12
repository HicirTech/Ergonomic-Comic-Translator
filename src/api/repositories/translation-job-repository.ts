import type { TranslationJobRecord } from "../interfaces";
import type { JobRepository } from "./file-job-repository.ts";

export type TranslationJobRepository = JobRepository<TranslationJobRecord>;
