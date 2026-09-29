import type { LlmSession, SessionFailure, VisionSession } from "../../sessions/interfaces/index.ts";

/**
 * The GPU is time-shared between the vision models (lane "gpu") and the LLM (lane "llm"): at most one
 * of them is loaded, and loading one unloads the other first.
 */
export interface ModelHost {
  readonly loaded: "gpu" | "llm" | null;
  /** Why a red light stopped the loaded session (Chinese), or null; close it before loading again. */
  readonly redLightReasonZh: string | null;
  /** The loaded vision session; throws when the vision models are not loaded. */
  vision(): VisionSession;
  /** The loaded LLM session; throws when the LLM is not loaded. */
  llm(): LlmSession;
  /** Loads the lane's models; returns why not when the governor or the GPU lock refuses. */
  open(lane: "gpu" | "llm"): Promise<SessionFailure | null>;
  close(): Promise<void>;
}
