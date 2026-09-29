import type { SourceLine } from "../../terms/interfaces/index.ts";
import type { TranslationUnit } from "../../translate/interfaces/index.ts";

/** The translatable text of one page, in reading order, with a way back to regions and utterances. */
export interface VolumePageText {
  page: number;
  units: TranslationUnit[];
  lines: SourceLine[];
  /** unit id -> index of the region in the page's vision result and of the utterance in that region. */
  refs: Record<string, { regionIndex: number; utteranceIndex: number }>;
}
