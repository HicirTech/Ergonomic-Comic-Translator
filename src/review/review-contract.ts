import type { ChatMessage } from "../llm/interfaces/index.ts";

/** Bumped whenever prompt wording or message layout changes; part of every review cache key. */
export const reviewContractVersion = "tr-review@1";
export const reviewMaxTokens = 120;
const reasonMaxChars = 60;

const systemPrompt = [
  "你是漫画翻译的审校。给你一句日文原文和它的简体中文译文（原文来自 OCR，可能有错字）。",
  "只判断两件事：1. 译文是否说出了原文的意思（没有漏掉整句或整个分句，没有把意思弄反，人称和主语没有错，专有名词没有译错）；2. 译文是否是通顺可懂的中文。",
  "措辞不同、语气词增减、粗俗程度不必在意。拿不准时判 ok。",
  "输出 JSON：{\"verdict\":\"ok\"或\"doubt\",\"reason\":\"不超过 30 字\"}。",
].join("\n");

/** One unit's source and translation for the reviewer; the source is data, never instructions. */
export const reviewMessages = (source: string, target: string): ChatMessage[] => [
  { role: "system", content: systemPrompt },
  { role: "user", content: JSON.stringify({ 原文: source, 译文: target }) },
];

export const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason"],
  properties: {
    verdict: { enum: ["ok", "doubt"] },
    reason: { type: "string", maxLength: reasonMaxChars },
  },
} as const;

/** The reviewer's doubt, as its reason, or null when the translation passed or the answer is not a review. */
export const parseReview = (content: string): string | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  const review = typeof parsed === "object" && parsed !== null ? (parsed as { verdict?: unknown; reason?: unknown }) : {};
  if (review.verdict !== "doubt") return null;
  return typeof review.reason === "string" && review.reason.trim() !== "" ? review.reason.trim() : "译文可疑";
};
