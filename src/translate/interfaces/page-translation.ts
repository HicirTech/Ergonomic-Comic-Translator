import type { CheckCode } from "../../qa/interfaces/index.ts";

export interface PageTranslation {
  targets: Record<string, string>;
  /** Units still failing after the retry rounds, with the checks they failed last; they go down the fallback ladder. */
  failures: Record<string, CheckCode[]>;
  requests: number;
}
