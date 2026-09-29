import type { ChatMessage } from "./chat-message.ts";

/** One JSON-constrained chat completion. Sampling is fixed by the client (see chat-client.ts). */
export interface ChatRequest {
  messages: ChatMessage[];
  /** JSON Schema the output must follow (grammar-constrained on the server). */
  schema: Record<string, unknown>;
  maxTokens: number;
  seed: number;
}
