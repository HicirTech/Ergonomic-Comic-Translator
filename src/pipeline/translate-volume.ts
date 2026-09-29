import { cacheKey, seedFromKey } from "../core/cache-key.ts";
import { missingTerms, replaceUntranslatedName } from "../qa/term-compliance.ts";
import type { FixedTerm } from "../terms/interfaces/index.ts";
import { createMatcher } from "../terms/matcher.ts";
import { contractVersion } from "../translate/contract.ts";
import { historyWindowStart, sourceTokens } from "../translate/history-window.ts";
import type { CompleteFn, GlossaryEntry, HistoryPage, SourceLanguage, TranslationUnit } from "../translate/interfaces/index.ts";
import { translatePage } from "../translate/translate-page.ts";
import type { PageTranslationResult, VolumePageText } from "./interfaces/index.ts";

/**
 * T wave: translates pages in order. Each request carries the frozen role table, the terms found on the
 * page, and a history window of earlier pages chosen from source lengths alone (so re-translating one
 * page sees exactly what the volume run saw). Names the model left untranslated are replaced before the
 * decisive checks (post-dict); other glossary misses get one targeted re-request, the rest are flagged.
 */
export const translateVolume = async (
  pages: readonly VolumePageText[],
  terms: readonly FixedTerm[],
  roleTable: readonly GlossaryEntry[],
  glossarySha: string,
  language: SourceLanguage,
  complete: CompleteFn,
  modelSha: string,
  historyBudget: number,
): Promise<PageTranslationResult[]> => {
  const matcher = createMatcher(terms.flatMap((term) => term.surfaces.map((surface) => ({ surface, value: term }))));
  const tokens = pages.map((page) => sourceTokens(page.units));
  const results: PageTranslationResult[] = [];

  for (const [index, page] of pages.entries()) {
    if (page.units.length === 0) {
      results.push({ page: page.page, units: [], targets: {}, flags: {}, requests: 0 });
      continue;
    }
    const start = historyWindowStart(tokens.slice(0, index), historyBudget);
    const history: HistoryPage[] = results.slice(start, index)
      .filter((result) => result.units.length > 0)
      .map((result) => ({ page: result.page, units: result.units, targets: result.targets }));

    const matchesOf = (source: string) => {
      const found = new Map<FixedTerm, string>();
      for (const match of matcher.findAll(source)) found.set(match.value, match.surface);
      return [...found].map(([term, surface]) => ({ term, surface }));
    };
    const pageMatches = [...new Map(page.units.flatMap((unit) => matchesOf(unit.source)).map((entry) => [entry.term, entry])).values()];
    const matchingTerms: GlossaryEntry[] = pageMatches.map(({ term }) => ({ source: term.canonical, target: term.target }));

    const request = { language, page: page.page, units: page.units, glossary: [...roleTable], matchingTerms, history };
    const seed = seedFromKey(cacheKey({
      stage: "translate",
      contract: contractVersion,
      modelSha,
      glossarySha,
      units: page.units.map((unit) => [unit.id, unit.source]),
      history: history.map((entry) => entry.units.map((unit) => unit.source)),
    }));
    const expectedOf = (unit: TranslationUnit) =>
      matchesOf(unit.source).map(({ term, surface }) => ({ surface, target: term.target, aliases: term.targetAliases }));
    const postDict = (unit: TranslationUnit, target: string) =>
      expectedOf(unit).reduce((text, term) => replaceUntranslatedName(text, term) ?? text, target);
    const translation = await translatePage(request, complete, seed, { postDict });
    const targets = { ...translation.targets };
    const flags: Record<string, string[]> = Object.fromEntries(Object.entries(translation.failures).map(([id, codes]) => [id, [...codes]]));
    let requests = translation.requests;

    for (const unit of page.units) {
      const target = targets[unit.id];
      if (target === undefined) continue;
      const expected = expectedOf(unit);
      let repaired = target;
      let missing = missingTerms(repaired, expected);
      if (missing.length > 0) {
        const retry = await translatePage(
          { ...request, units: [unit], matchingTerms: missing.map((term) => ({ source: term.surface, target: term.target })) },
          complete,
          seed + 7,
          { postDict },
        );
        requests += retry.requests;
        const candidate = retry.targets[unit.id];
        if (candidate !== undefined && missingTerms(candidate, expected).length < missing.length) {
          repaired = candidate;
          missing = missingTerms(candidate, expected);
        }
      }
      targets[unit.id] = repaired;
      if (missing.length > 0) flags[unit.id] = [...(flags[unit.id] ?? []), "TR_TERM_MISS"];
    }
    results.push({ page: page.page, units: page.units, targets, flags, requests });
  }
  return results;
};
