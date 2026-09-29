/** A finished completion with the facts the QA checks need. */
export interface ChatResult {
  content: string;
  /** Anything the server parsed as reasoning; must stay empty (reasoning is disabled three ways). */
  reasoningContent: string;
  finishReason: string | null;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  generationTokensPerSecond: number | null;
  elapsedMs: number;
}
