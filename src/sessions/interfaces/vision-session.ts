import type { VisionClient } from "../../pipeline/interfaces/index.ts";
import type { LoadResult } from "../../workers/interfaces/index.ts";

/** Loaded vision models in their worker processes, holding the GPU lock until closed. */
export interface VisionSession {
  client: VisionClient;
  /** "dml" or "cpu": where the heavy models run. */
  ep: string;
  loads: LoadResult[];
  /** Aborted on a red light (reason: Chinese text); the workers are already killed then and in-flight requests fail. */
  signal: AbortSignal;
  close(): Promise<void>;
}
