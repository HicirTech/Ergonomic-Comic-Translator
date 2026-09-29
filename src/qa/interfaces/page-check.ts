import type { CheckCode } from "./check-code.ts";

/** Outcome of checking one completion: page-level structure problems and per-unit findings. */
export interface PageCheck {
  /** Every non-empty translation returned, by id, including ones that failed a content check (candidates for the fallback ladder). */
  targets: Record<string, string>;
  pageFailures: CheckCode[];
  unitFailures: Record<string, CheckCode[]>;
  /** Ids that need another request: missing, empty or failing a decisive unit check. */
  retryIds: string[];
}
