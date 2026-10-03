import type { CheckCode } from "../../qa/interfaces/index.ts";

export interface PageTranslation {
  targets: Record<string, string>;
  /**
   * Units still failing after the retry rounds, with the checks they failed last. A unit whose last
   * attempt was complete and only doubtful (see translatePage) also has a target; the others have none.
   */
  failures: Record<string, CheckCode[]>;
  requests: number;
}
