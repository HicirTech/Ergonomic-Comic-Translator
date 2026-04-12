import type { OcrJobRecord } from "../interfaces";
import type { JobRepository } from "./file-job-repository.ts";

export type OcrJobRepository = JobRepository<OcrJobRecord>;