import type { LlmSession, SessionFailure, VisionSession } from "../../sessions/interfaces/index.ts";
import type { ModelNeed } from "./model-need.ts";

/**
 * The GPU is time-shared between the vision models (lane "gpu") and one LLM (lane "llm"): at most one of them
 * is loaded, and loading one unloads the other first, as does an LLM for another role.
 */
export interface ModelHost {
  readonly loaded: ModelNeed | null;
  /** Why a red light stopped the loaded session (Chinese), or null; close it before loading again. */
  readonly redLightReasonZh: string | null;
  /** The loaded vision session; throws when the vision models are not loaded. */
  vision(): VisionSession;
  /** The loaded LLM session; throws when no LLM is loaded. */
  llm(): LlmSession;
  /** Loads what `need` names; returns why not when the governor or the GPU lock refuses. */
  open(need: ModelNeed): Promise<SessionFailure | null>;
  close(): Promise<void>;
}
