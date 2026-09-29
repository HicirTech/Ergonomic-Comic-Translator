import type { CutReason } from "./cut-reason.ts";

/** One utterance inside a region: consecutive lines in reading order. */
export interface UtteranceSplit {
  /** Indexes into the region's lines, in reading order. */
  lines: number[];
  /** Why this utterance starts a new one (empty for the first). */
  startReasons: CutReason[];
  /** Line indexes inside the utterance where a style span (e.g. bigger emphasis text) begins. */
  styleBreaks: number[];
  /** A lone speaker label such as 【リン】 or "リン：". */
  nameTag: boolean;
  /** The whole utterance sits in （）: inner monologue. */
  thought: boolean;
}
