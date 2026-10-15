import { cacheKey, seedFromKey } from "../core/cache-key.ts";
import { missingTerms, replaceUntranslatedName } from "../qa/term-compliance.ts";
import type { FixedTerm } from "../terms/interfaces/index.ts";
import { noteOf } from "../terms/freeze.ts";
import { createMatcher } from "../terms/matcher.ts";
import { translationContracts } from "../translate/contracts.ts";
import { cryOf, shownCry, stretchCry } from "../translate/cries.ts";
import { historyWindowStart, sourceTokens } from "../translate/history-window.ts";
import type { GlossaryEntry, HistoryPage, TranslationUnit } from "../translate/interfaces/index.ts";
import { translatePage } from "../translate/translate-page.ts";
import type { PageTranslationResult, VolumePageText, VolumeTranslationContext } from "./interfaces/index.ts";

/** A wave dash stretches a syllable (か〜す〜み); it is never part of the name itself. */
const stretchMarks = /[〜~～]/gu;

/**
 * T wave, one page: the request carries the frozen role table, the terms found on the page, and a
 * history window of earlier pages chosen from source lengths alone (so re-translating one page sees
 * exactly what the volume run saw). `earlier` holds the results of pages before `index`, null where a
 * page has no result. A long cry is shown to the model as a few repeats and its answer stretched back. Names
 * the model left untranslated are replaced before the decisive checks (post-dict); other glossary misses get
 * one targeted re-request, the rest are flagged.
 */
export const translateVolumePage = async (
  pages: readonly VolumePageText[],
  index: number,
  earlier: readonly (PageTranslationResult | null)[],
  context: VolumeTranslationContext,
): Promise<PageTranslationResult> => {
  const page = pages[index]!;
  if (page.units.length === 0) {
    return { page: page.page, units: [], targets: {}, flags: {}, requests: 0 };
  }
  const { terms, roleTable, language, complete, modelSha, historyBudget } = context;
  const contract = translationContracts[context.contract];
  const matcher = createMatcher(terms.flatMap((term) => term.surfaces.map((surface) => ({ surface, value: term }))));
  const start = historyWindowStart(pages.slice(0, index).map((earlierPage) => sourceTokens(earlierPage.units)), historyBudget);
  const history: HistoryPage[] = earlier.slice(start, index)
    .filter((result): result is PageTranslationResult => result !== null && result.units.length > 0)
    .map((result) => ({ page: result.page, units: result.units, targets: result.targets }));

  const matchesOf = (source: string) => {
    const found = new Map<FixedTerm, string>();
    for (const match of matcher.findAll(source.replace(stretchMarks, ""))) found.set(match.value, match.surface);
    return [...found].map(([term, surface]) => ({ term, surface }));
  };
  const pageMatches = [...new Map(page.units.flatMap((unit) => matchesOf(unit.source)).map((entry) => [entry.term, entry])).values()];
  const matchingTerms: GlossaryEntry[] = pageMatches.map(({ term }) => {
    const note = noteOf(term);
    return { source: term.canonical, target: term.target, ...(note ? { note } : {}) };
  });

  const cries = new Map(page.units.flatMap((unit) => {
    const cry = cryOf(unit.source);
    return cry ? [[unit.id, cry] as const] : [];
  }));
  const units = page.units.map((unit) => {
    const cry = cries.get(unit.id);
    return cry ? { ...unit, source: shownCry(cry) } : unit;
  });
  const request = { language, page: page.page, units, glossary: [...roleTable], matchingTerms, history };
  // The seed follows what the model is asked to translate, not the glossary: a changed term changes the prompt
  // only on the pages where it occurs, and every other page translates as before.
  const seed = seedFromKey(cacheKey({
    stage: "translate",
    contract: contract.version,
    modelSha,
    units: page.units.map((unit) => [unit.id, unit.source]),
    history: history.map((entry) => entry.units.map((unit) => unit.source)),
  }));
  const expectedOf = (unit: TranslationUnit) =>
    matchesOf(unit.source).map(({ term, surface }) => ({ surface, target: term.target, aliases: term.targetAliases }));
  const postDict = (unit: TranslationUnit, target: string) =>
    expectedOf(unit).reduce((text, term) => replaceUntranslatedName(text, term) ?? text, target);
  const translation = await translatePage(request, complete, seed, { contract, postDict });
  const targets = { ...translation.targets };
  const flags: Record<string, string[]> = Object.fromEntries(Object.entries(translation.failures).map(([id, codes]) => [id, [...codes]]));
  let requests = translation.requests;

  for (const unit of units) {
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
        { contract, postDict },
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
  for (const [id, cry] of cries) {
    const target = targets[id];
    if (target !== undefined) targets[id] = stretchCry(target, cry);
  }
  return { page: page.page, units: page.units, targets, flags, requests };
};

/** T wave for a whole volume in page order. */
export const translateVolume = async (pages: readonly VolumePageText[], context: VolumeTranslationContext) => {
  const results: PageTranslationResult[] = [];
  for (const index of pages.keys()) {
    results.push(await translateVolumePage(pages, index, results, context));
  }
  return results;
};
