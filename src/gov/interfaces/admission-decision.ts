import type { AdmissionReason } from "./admission-reason.ts";
import type { DeviceBudget } from "./device-budget.ts";

export interface AdmissionDecision {
  admitted: boolean;
  reasons: AdmissionReason[];
  budget: DeviceBudget | null;
  /** RAM a new load may still take: availPhys - host headroom. */
  hostAvailableBytes: number;
  /** Commit left after the plan is charged. */
  commitAfterBytes: number;
}
