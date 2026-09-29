/** Why a model session did not open; nothing was loaded and nothing needs cleaning up. */
export interface SessionFailure {
  /** denied: the governor refused the load; busy: another process holds the GPU lock; no_tier: no LLM tier fits. */
  kind: "denied" | "busy" | "no_tier";
  messageZh: string;
}
