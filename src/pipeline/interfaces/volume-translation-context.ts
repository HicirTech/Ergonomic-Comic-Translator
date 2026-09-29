import type { FixedTerm } from "../../terms/interfaces/index.ts";
import type { CompleteFn, GlossaryEntry, SourceLanguage } from "../../translate/interfaces/index.ts";

/** Everything a page translation needs besides the pages themselves; fixed for a whole volume run. */
export interface VolumeTranslationContext {
  terms: readonly FixedTerm[];
  roleTable: readonly GlossaryEntry[];
  glossarySha: string;
  language: SourceLanguage;
  complete: CompleteFn;
  modelSha: string;
  /** Source tokens of earlier pages carried as history. */
  historyBudget: number;
}
