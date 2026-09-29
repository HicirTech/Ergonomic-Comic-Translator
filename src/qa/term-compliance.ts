/** A glossary entry matched in the source of one utterance. */
interface MatchedTerm {
  surface: string;
  target: string;
  aliases: readonly string[];
}

/**
 * S9 term compliance: every glossary entry found in the source must appear in the translation as its
 * fixed rendering or one of its accepted aliases. Returns the entries that do not.
 */
export const missingTerms = (target: string, matched: readonly MatchedTerm[]) =>
  matched.filter((term) => ![term.target, ...term.aliases].some((rendering) => rendering !== "" && target.includes(rendering)));

/**
 * Deterministic post-dict repair for a name the model left untranslated: replaces the source surface
 * with the fixed rendering. Returns null when the surface is not in the text (then a targeted re-translation
 * with "X must be translated as Y" is needed).
 */
export const replaceUntranslatedName = (target: string, term: MatchedTerm) =>
  target.includes(term.surface) ? target.split(term.surface).join(term.target) : null;
