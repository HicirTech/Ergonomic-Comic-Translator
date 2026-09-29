import type { TranslationUnit } from "../../translate/interfaces/index.ts";

/** Final text of one page after translation, retries and term compliance. */
export interface PageTranslationResult {
  page: number;
  units: TranslationUnit[];
  targets: Record<string, string>;
  /** Flag codes per unit id, e.g. TR_TERM_MISS or the decisive checks a unit still fails. */
  flags: Record<string, string[]>;
  requests: number;
}
