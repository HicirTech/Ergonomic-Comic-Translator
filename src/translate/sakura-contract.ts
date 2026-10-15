import type { ChatMessage } from "../llm/interfaces/index.ts";
import type { AnswerParser } from "../qa/interfaces/index.ts";
import type { GlossaryEntry, HistoryPage, PageRequest, TranslationContract, TranslationUnit } from "./interfaces/index.ts";

/** Bumped whenever prompt wording or message layout changes; part of every translation cache key. */
export const sakuraContractVersion = "tr-sakura@1";

/** The Sakura model card's prompt, verbatim: the model was trained on it. */
const systemPrompt = "你是一个轻小说翻译模型，可以流畅通顺地以日本轻小说的风格将日文翻译成简体中文，并联系上下文正确使用人称代词，不擅自添加原文中没有的代词。";
/** The model card's recommended sampling. */
const temperature = 0.3;
const topP = 0.8;
/** Twice the source length in tokens leaves room for renderings longer than their source. */
const tokensPerSourceChar = 2;
const tokensPerUnit = 16;
const maxAnswerTokens = 2048;

/** A unit is one line of the request: a line break inside it would change the line count. */
const asLine = (text: string) => text.split("\n").map((part) => part.trim()).filter((part) => part !== "").join(" ");

const glossaryLines = (terms: readonly GlossaryEntry[]) =>
  terms.map((term) => `${term.source}->${term.target}${term.note ? ` #${term.note}` : ""}`).join("\n");

const ask = (units: readonly TranslationUnit[], terms: readonly GlossaryEntry[]) => {
  const text = units.map((unit) => asLine(unit.source)).join("\n");
  return terms.length === 0
    ? `将下面的日文文本翻译成中文：${text}`
    : `根据以下术语表（可以为空）：\n${glossaryLines(terms)}\n将下面的日文文本根据对应关系和备注翻译成中文：${text}`;
};

/** Earlier pages as earlier turns; a unit without an accepted translation is left out of both sides. */
const historyTurns = (history: readonly HistoryPage[]): ChatMessage[] =>
  history.flatMap((entry) => {
    const translated = entry.units.filter((unit) => entry.targets[unit.id] !== undefined);
    return [
      { role: "user" as const, content: ask(translated, []) },
      { role: "assistant" as const, content: translated.map((unit) => asLine(entry.targets[unit.id]!)).join("\n") },
    ];
  });

/**
 * tr-sakura@1 for the Sakura line models: the model card's system prompt, earlier pages as earlier turns, then
 * this page's units one per line with the glossary entries that occur on it as "src->dst #note" lines. The
 * answer is one line per unit, read back in order.
 */
export const buildSakuraMessages = (request: PageRequest): ChatMessage[] => [
  { role: "system", content: systemPrompt },
  ...historyTurns(request.history),
  { role: "user", content: ask(request.units, request.matchingTerms) },
];

/** One non-empty line per unit, in order; another count is another shape. */
export const parseLineAnswer: AnswerParser = (content, units) => {
  const lines = content.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  if (lines.length !== units.length) return null;
  return { values: Object.fromEntries(units.map((unit, index) => [unit.id, lines[index]])), extraKeys: false };
};

export const sakuraMaxTokens = (units: readonly TranslationUnit[]) =>
  Math.min(maxAnswerTokens, units.reduce((sum, unit) => sum + tokensPerUnit + tokensPerSourceChar * [...unit.source].length, 0));

export const sakuraContract: TranslationContract = {
  version: sakuraContractVersion,
  buildMessages: buildSakuraMessages,
  schema: () => null,
  maxTokens: sakuraMaxTokens,
  temperature,
  topP,
  parse: parseLineAnswer,
};
