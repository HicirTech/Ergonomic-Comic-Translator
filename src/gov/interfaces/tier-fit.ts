import type { LlmTier } from "./llm-tier.ts";

/**
 * How a tier fits the current budget:
 * - resident: LLM and vision models fit together;
 * - timeshare: the LLM fits only after the vision models are released;
 * - no: it does not fit.
 */
export interface TierFit {
  tier: LlmTier;
  devBytes: number;
  hostPrivateBytes: number;
  fit: "resident" | "timeshare" | "no";
}
