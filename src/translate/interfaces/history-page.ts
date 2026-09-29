import type { TranslationUnit } from "./translation-unit.ts";

/** An earlier page given as context: its units and the translations accepted for them. */
export interface HistoryPage {
  page: number;
  units: TranslationUnit[];
  targets: Record<string, string>;
}
