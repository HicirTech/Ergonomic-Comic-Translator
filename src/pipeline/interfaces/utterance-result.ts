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
  engine: "baberu" | "manga-ocr";
  /** Clockwise quarter turns of the chosen reading (2 when textline-ori flipped it). */
  quarterTurns: number;
  /** Flags such as ORIENT_UNSURE or OCR_EMPTY; codes only, never text. */
  flags: string[];
}
