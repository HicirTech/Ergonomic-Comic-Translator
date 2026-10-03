import type { Box } from "../../geometry/interfaces/index.ts";
import type { CutReason } from "../../stages/utterances/interfaces/index.ts";

export interface UtteranceResult {
  /** Box in the region's upright frame. */
  box: Box;
  lineIndexes: number[];
  startReasons: CutReason[];
  nameTag: boolean;
  thought: boolean;
  text: string;
  meanProb: number;
  minProb: number;
  /** The sentence reader that read the utterance, also when `text` comes from the lines. */
  engine: "baberu" | "manga-ocr";
  /**
   * Where `text` and its probabilities come from: the sentence reader, or the per-line recognizer's lines
   * joined when the sentence reader lost text (preferLineReading).
   */
  textFrom: "sentence" | "lines";
  /** Clockwise quarter turns of the sentence reader's chosen reading (2 when textline-ori flipped it). */
  quarterTurns: number;
  /** Flags such as ORIENT_UNSURE or OCR_EMPTY; codes only, never text. */
  flags: string[];
}
