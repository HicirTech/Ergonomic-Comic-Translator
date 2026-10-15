import type { FixedTerm } from "../../terms/interfaces/index.ts";
import type { CompleteFn, ContractId, GlossaryEntry, SourceLanguage } from "../../translate/interfaces/index.ts";

/** Everything a page translation needs besides the pages themselves; fixed for a whole volume run. */
export interface VolumeTranslationContext {
  terms: readonly FixedTerm[];
  roleTable: readonly GlossaryEntry[];
  glossarySha: string;
  language: SourceLanguage;
  complete: CompleteFn;
  modelSha: string;
  /** How the loaded model is asked and read. */
  contract: ContractId;
  /** Source tokens of earlier pages carried as history. */
  historyBudget: number;
}
