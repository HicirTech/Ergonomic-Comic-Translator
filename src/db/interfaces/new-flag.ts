/** A QA finding to show in the review list; codes only, the evidence never carries source or target text. */
export interface NewFlag {
  code: string;
  severity: "info" | "warn" | "error";
  class: "decisive" | "advisory";
  evidence: Record<string, unknown>;
}
