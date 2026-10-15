import type { TranslationUnit } from "../../translate/interfaces/index.ts";
import type { ParsedAnswer } from "./parsed-answer.ts";

/** Reads a completion into values by unit id; null when the answer has another shape than was asked for. */
export type AnswerParser = (content: string, units: readonly TranslationUnit[]) => ParsedAnswer | null;
