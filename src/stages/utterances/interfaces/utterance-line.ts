import type { Box } from "../../../geometry/interfaces/index.ts";

/** A line as the splitter sees it: its box in the region's upright frame plus optional structure OCR. */
export interface UtteranceLine {
  box: Box;
  /** Structure-OCR text; empty when not read yet. */
  text: string;
  /** Mean token probability of `text`; bracket and name rules only trust text at 0.8 or above. */
  conf: number;
}
