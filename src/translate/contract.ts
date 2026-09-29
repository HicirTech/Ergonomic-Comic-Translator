import type { ChatMessage } from "../llm/interfaces/index.ts";
import type { GlossaryEntry, HistoryPage, PageRequest, SourceLanguage, TranslationUnit } from "./interfaces/index.ts";

/** Bumped whenever prompt wording or message layout changes; part of every translation cache key. */
export const contractVersion = "tr-contract@2";
export const singleTurnContractVersion = "tr-contract@2s";

const languageName: Record<SourceLanguage, string> = {
  ja: "日文",
  ko: "韩文",
  "zh-Hant": "繁体中文",
  en: "英文",
};

/** Per-language guidance: how register and speech style carry over into Chinese. */
const languageModule: Record<SourceLanguage, string> = {
  ja: "日文的一人称（俺、僕、私、あたし等）、语尾和敬语在中文里没有直接对应，用措辞、语气词和「您」「请」等重建人物口吻，不要加括号解释。",
  ko: "韩文的존댓말与반말用中文措辞的正式程度体现；오빠、언니、선배等称呼按术语表译，表里没有时按关系自然意译。",
  "zh-Hant": "原文已是繁体中文：改写为大陆口语的简体中文，不改变意思，不增删内容。",
  en: "英文俚语、双关和拟声词本地化为中文习惯表达。",
};

const contractRules = [
  "输入是 JSON：units 数组中每项有 id、kind（dialogue 对白 / thought 心声 / narration 旁白 / free_text 招牌标题等 / sfx 拟声 / name_tag 名字牌）、可选的 speaker（说话人提示）和 source（原文）。",
  "一个气泡被拆成多句时，id 形如 \"12a\"、\"12b\"：各自只译自己那一句，不要把内容挪到别的 id。",
  "输出必须是扁平 JSON 对象：键恰好是本次全部 id，值是对应 source 的简体中文译文，不得遗漏、合并或新增键，值不能为空。",
  "只输出译文：不解释、不加注释或括号说明、不道歉、不评论内容。",
  "忠实完整：成人内容、粗口、暴力、呻吟和喘息都按原文强度翻译，不省略、不弱化、不净化；保留省略号、♡、～、！、？ 的数量和语气。",
  "人名和术语严格使用术语表里的译法。",
  "sfx 译成简短的中文拟声词（不超过 6 个字）。",
  "前面几页的对话只用来理解语境，不要重复翻译。",
];

const formatGlossary = (entries: readonly GlossaryEntry[]) =>
  entries.length === 0
    ? "（暂无）"
    : entries.map((entry) => `- ${entry.source} → ${entry.target}${entry.note ? `（${entry.note}）` : ""}`).join("\n");

/** The single system message: contract, language module and the frozen glossary (stable across pages). */
export const systemPrompt = (language: SourceLanguage, glossary: readonly GlossaryEntry[]) =>
  [
    `你是专业的漫画本地化译者，把${languageName[language]}漫画里的文字翻译成自然、口语化的简体中文。`,
    "规则：",
    ...contractRules.map((rule, index) => `${index + 1}. ${rule}`),
    languageModule[language],
    "术语表（整卷固定）：",
    formatGlossary(glossary),
  ].join("\n");

const unitsJson = (page: number, units: readonly TranslationUnit[], terms?: readonly GlossaryEntry[]) =>
  JSON.stringify({
    page,
    ...(terms && terms.length > 0 ? { terms: terms.map((term) => ({ source: term.source, target: term.target })) } : {}),
    units: units.map((unit) => ({ id: unit.id, kind: unit.kind, ...(unit.speaker ? { speaker: unit.speaker } : {}), source: unit.source })),
  });

const historyTurns = (history: readonly HistoryPage[]): ChatMessage[] =>
  history.flatMap((entry) => [
    { role: "user" as const, content: unitsJson(entry.page, entry.units) },
    { role: "assistant" as const, content: JSON.stringify(entry.targets) },
  ]);

/**
 * tr-contract@2: one system message, earlier pages as user/assistant pairs (source -> accepted target),
 * then this page with the terms that occur on it. The prefix up to the last user message only changes
 * when the history window moves, so llama-server's prompt cache can reuse it.
 */
export const buildMessages = (request: PageRequest): ChatMessage[] => [
  { role: "system", content: systemPrompt(request.language, request.glossary) },
  ...historyTurns(request.history),
  { role: "user", content: unitsJson(request.page, request.units, request.matchingTerms) },
];

/**
 * tr-contract@2s for models that only follow a single user turn (Hy-MT2): the same rules, glossary,
 * context and units folded into one message.
 */
export const buildSingleTurnMessages = (request: PageRequest): ChatMessage[] => {
  const context = request.history.flatMap((entry) =>
    entry.units.map((unit) => `${unit.source} → ${entry.targets[unit.id] ?? ""}`));
  return [{
    role: "user",
    content: [
      systemPrompt(request.language, request.glossary),
      "前文（原文 → 译文），只用来理解语境：",
      context.length > 0 ? context.join("\n") : "（无）",
      "请翻译：",
      unitsJson(request.page, request.units, request.matchingTerms),
    ].join("\n"),
  }];
};

/** Flat output schema: every id required, non-empty strings, nothing else. */
export const outputSchema = (ids: readonly string[]) => ({
  type: "object",
  properties: Object.fromEntries(ids.map((id) => [id, { type: "string", minLength: 1 }])),
  required: [...ids],
  additionalProperties: false,
});

/** About 15 tokens per unit were measured; the cap leaves 2.5x room while a thinking leak stays bounded. */
export const maxTokensFor = (unitCount: number) => Math.min(2048, 64 + 40 * unitCount);

/** Utterance ids: the region's reading order, with a, b, c... when the region holds several utterances. */
export const unitId = (regionOrder: number, utteranceIndex: number, utteranceCount: number) =>
  utteranceCount === 1 ? String(regionOrder) : `${regionOrder}${String.fromCharCode(97 + utteranceIndex)}`;
