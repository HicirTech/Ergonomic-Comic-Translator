import type { DeviceBudget } from "./device-budget.ts";
import type { LightAssessment } from "./light-assessment.ts";
import type { ResourceSample } from "./resource-sample.ts";

/** What the resource monitor knows after one tick. */
export interface MonitorState {
  sample: ResourceSample;
  budgets: Map<string, DeviceBudget>;
  assessment: LightAssessment;
  /** External load on an active adapter stayed above the yield threshold long enough: run at reduced concurrency. */
  yielding: boolean;
}
