import type { ChatMessage } from "../../llm/interfaces/index.ts";
import type { AnswerParser } from "../../qa/interfaces/index.ts";
import type { PageRequest } from "./page-request.ts";
import type { TranslationUnit } from "./translation-unit.ts";

/** How one model family is asked and how its answer is read; `version` is part of every translation cache key. */
export interface TranslationContract {
  version: string;
  buildMessages(request: PageRequest): ChatMessage[];
  /** JSON Schema the answer must follow, or null when the answer is free text that `parse` reads. */
  schema(units: readonly TranslationUnit[]): Record<string, unknown> | null;
  maxTokens(units: readonly TranslationUnit[]): number;
  temperature: number;
  topP: number;
  parse: AnswerParser;
}
