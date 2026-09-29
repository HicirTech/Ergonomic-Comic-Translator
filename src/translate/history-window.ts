import type { TranslationUnit } from "./interfaces/index.ts";

/** JSON framing per unit, in tokens, on top of its text. */
const perUnitOverhead = 8;

/**
 * Token estimate of a page's source side. CJK text runs about one token per character with the Qwen
 * tokenizer; the estimate only has to be monotone and deterministic, not exact.
 */
export const sourceTokens = (units: readonly TranslationUnit[]) =>
  units.reduce((sum, unit) => sum + [...unit.source].length + perUnitOverhead, 0);

/**
 * First page (index into `tokensByPage`) of the history window for the page after the last entry.
 * The window grows page by page; when it would exceed `budget` it drops its oldest pages until it is
 * at or below `lowWater` x budget. The start therefore moves in jumps, so consecutive pages share the
 * same prompt prefix, and it depends only on source lengths: re-translating one page reproduces
 * exactly the context the whole-volume run used.
 */
export const historyWindowStart = (tokensByPage: readonly number[], budget: number, lowWater = 0.5) => {
  let start = 0;
  let total = 0;
  for (let index = 0; index < tokensByPage.length; index += 1) {
    total += tokensByPage[index]!;
    if (total > budget) {
      while (start <= index && total > lowWater * budget) {
        total -= tokensByPage[start]!;
        start += 1;
      }
    }
  }
  return start;
};
