import type { ChatMessage } from "./chat-message.ts";

/** One chat completion: greedy and JSON-constrained unless the request says otherwise (see chat-client.ts). */
export interface ChatRequest {
  messages: ChatMessage[];
  /** JSON Schema the output must follow (grammar-constrained on the server); null leaves the answer free text. */
  schema: Record<string, unknown> | null;
  maxTokens: number;
  seed: number;
  /** Left out, sampling is greedy: temperature 0 with every token considered (top_p 1). */
  temperature?: number;
  topP?: number;
}
