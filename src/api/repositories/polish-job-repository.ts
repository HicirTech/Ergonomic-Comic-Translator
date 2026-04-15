import type { PolishJobRecord } from "../interfaces";
import type { JobRepository } from "./file-job-repository.ts";

export type PolishJobRepository = JobRepository<PolishJobRecord>;
