import type { ChatRequest, ChatResult } from "../../llm/interfaces/index.ts";

/** Sends one completion; the translate stage does not care which server or model answers. */
export type CompleteFn = (request: ChatRequest) => Promise<ChatResult>;
