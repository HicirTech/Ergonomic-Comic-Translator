import type { SourceLanguage } from "../translate/interfaces/index.ts";
import { nameTagText } from "./candidates.ts";
import type { FixedTerm, SourceLine } from "./interfaces/index.ts";
import { japaneseHonorifics, koreanHonorifics, normKey } from "./norm-key.ts";

/** Kinds that name someone or somewhere; the common words and slang the extractor also reports fall under the rest. */
const namingKinds: ReadonlySet<FixedTerm["kind"]> = new Set(["person", "address", "place", "org"]);
const honorifics: Record<SourceLanguage, readonly string[]> = { ja: japaneseHonorifics, ko: koreanHonorifics, "zh-Hant": [], en: [] };
const quotes = [["「", "」"], ["『", "』"], ["【", "】"]] as const;
/** A word written in katakana alone is a loanword or a species, job or item name: worth one rendering for the whole volume. */
const katakanaWord = /^[ァ-ヶー・]+$/u;
/** Mimetic words (ムラムラ, ドキドキ) repeat a short unit; they are not terms. */
const reduplicated = /^(.{1,3})\1$/u;
/** A loanword seen this often is a term of the volume, not a one-off. */
const loanwordMinOccurrences = 2;

/** Whether a term is a loanword the volume keeps using, worth one fixed rendering. */
const isRecurringLoanword = (term: FixedTerm) =>
  term.occurrences >= loanwordMinOccurrences && katakanaWord.test(term.canonical) && !reduplicated.test(term.canonical);

/**
 * Whether the text itself treats one of the surfaces as a name: an honorific after it, quotation marks
 * around it, or a name tag that is it. Slang and sound words the extractor takes for people never appear so.
 */
export const hasNameEvidence = (surfaces: readonly string[], lines: readonly SourceLine[], language: SourceLanguage) => {
  const forms = surfaces.flatMap((surface) => [
    ...honorifics[language].map((honorific) => `${surface}${honorific}`),
    ...quotes.map(([open, close]) => `${open}${surface}${close}`),
  ]);
  const keys = surfaces.map(normKey);
  return lines.some((line) => {
    const text = line.text.normalize("NFKC");
    return (line.nameTag && keys.includes(normKey(nameTagText(text)))) || forms.some((form) => text.includes(form));
  });
};

/**
 * Whether a fixed term may steer the translation: it names someone or somewhere (a person with name evidence
 * in a language whose names carry honorifics; elsewhere the extractor's word stands), or it is a recurring
 * loanword.
 */
export const isTrustedTerm = (term: FixedTerm, lines: readonly SourceLine[], language: SourceLanguage) =>
  namingKinds.has(term.kind)
    ? term.kind !== "person" || honorifics[language].length === 0 || hasNameEvidence(term.surfaces, lines, language)
    : isRecurringLoanword(term);
