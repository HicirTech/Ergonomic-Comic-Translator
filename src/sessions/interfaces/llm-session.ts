import type { CompleteFn } from "../../translate/interfaces/index.ts";

/** A running llama-server with one model, holding the GPU lock until closed. */
export interface LlmSession {
  complete: CompleteFn;
  tierId: string;
  tierLabel: string;
  /** sha256 of the model file; part of every translation cache key. */
  modelSha: string;
  /** llama.cpp device name, or "none" on the CPU. */
  device: string;
  /** Aborted on a red light (reason: Chinese text); the server is already stopping then and requests fail. */
  signal: AbortSignal;
  close(): Promise<void>;
}
