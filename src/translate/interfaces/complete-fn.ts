import type { ChatMessage, ChatResult } from "../../llm/interfaces/index.ts";

/** Sends one constrained completion; the translate stage does not care which server or model answers. */
export type CompleteFn = (messages: ChatMessage[], schema: Record<string, unknown>, maxTokens: number, seed: number) => Promise<ChatResult>;
