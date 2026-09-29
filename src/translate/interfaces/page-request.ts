import type { GlossaryEntry } from "./glossary-entry.ts";
import type { HistoryPage } from "./history-page.ts";
import type { SourceLanguage } from "./source-language.ts";
import type { TranslationUnit } from "./translation-unit.ts";

/** Everything one page translation request is built from. */
export interface PageRequest {
  language: SourceLanguage;
  page: number;
  units: TranslationUnit[];
  /** Frozen for the whole volume; part of the stable prompt prefix. */
  glossary: GlossaryEntry[];
  /** Glossary entries whose source occurs on this page. */
  matchingTerms: GlossaryEntry[];
  history: HistoryPage[];
}
