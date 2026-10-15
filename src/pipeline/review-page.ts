import { cacheKey, seedFromKey } from "../core/cache-key.ts";
import { isRetryableLlmError } from "../llm/retryable.ts";
import { parseReview, reviewContractVersion, reviewMaxTokens, reviewMessages, reviewSchema } from "../review/review-contract.ts";
import type { CompleteFn, TranslationUnit } from "../translate/interfaces/index.ts";

/** A source with fewer letters is a cry or a word on its own: nothing a review can get wrong. */
const minReviewedLetters = 4;
const letters = (text: string) => [...text].filter((char) => /\p{L}/u.test(char)).length;

/**
 * Asks the general model, unit by unit, whether a page's translations say what the source says and read as
 * Chinese. Returns the reviewer's reason for every unit it doubts. Cries and lone words are not asked about;
 * a request that fails is left out: the review never blocks a page, and a unit without a verdict is simply
 * not flagged.
 */
export const reviewPage = async (
  units: readonly TranslationUnit[],
  targets: Readonly<Record<string, string>>,
  complete: CompleteFn,
  modelSha: string,
): Promise<Record<string, string>> => {
  const doubts: Record<string, string> = {};
  for (const unit of units) {
    const target = targets[unit.id];
    if (target === undefined || letters(unit.source) < minReviewedLetters) continue;
    const seed = seedFromKey(cacheKey({ stage: "review", contract: reviewContractVersion, modelSha, source: unit.source, target }));
    let content: string;
    try {
      content = (await complete({ messages: reviewMessages(unit.source, target), schema: reviewSchema, maxTokens: reviewMaxTokens, seed })).content;
    } catch (error) {
      if (!isRetryableLlmError(error)) throw error;
      continue;
    }
    const reason = parseReview(content);
    if (reason !== null) doubts[unit.id] = reason;
  }
  return doubts;
};
