import type { DataPaths } from "../../core/data-paths.ts";
import type { FlagStore } from "../../db/flags.ts";
import type { VolumeStore } from "../../db/volumes.ts";
import type { JobRunner } from "../../jobs/job-runner.ts";
import type { ResourceStatus } from "./resource-status.ts";

export interface ServerDeps {
  paths: DataPaths;
  volumes: VolumeStore;
  flags: FlagStore;
  jobs: Pick<JobRunner, "submit" | "cancel" | "onEvent">;
  status: () => ResourceStatus;
  /** Model ids and runtime builds still to download; a job cannot start until both are empty. */
  missingDownloads: () => { models: string[]; runtimes: string[] };
  /** Built web UI (vite build output); null serves the API only. */
  staticRoot: string | null;
  /** How often the resource status is pushed over SSE. */
  statusIntervalMs: number;
}
