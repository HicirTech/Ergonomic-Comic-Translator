import type { LlmRole } from "../../gov/interfaces/index.ts";

/** What a device-lane task needs loaded: the vision models, or an LLM opened for one role. */
export type ModelNeed = { lane: "gpu" } | { lane: "llm"; role: LlmRole };
