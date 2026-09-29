import type * as Ort from "onnxruntime-node";

/**
 * One model family hosted by a worker process: owns its sessions and does its own pre- and
 * post-processing, so only compact task descriptions and results cross the process boundary.
 */
export interface VisionEngine {
  /** `modelsRoot` is the data directory's models/ folder; engines know their locked model ids. */
  load(ort: typeof Ort, modelsRoot: string, options: Ort.InferenceSession.SessionOptions): Promise<{
    inputNames: string[];
    outputNames: string[];
  }>;
  run(task: unknown): Promise<unknown>;
  release(): Promise<void>;
}
