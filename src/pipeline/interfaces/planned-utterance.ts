import type { Box } from "../../geometry/interfaces/index.ts";
import type { LineReading, OcrCrop } from "../../stages/ocr/interfaces/index.ts";
import type { UtteranceSplit } from "../../stages/utterances/interfaces/index.ts";

/** An utterance ready for OCR: where it is, how to crop it, and which reader handles it. */
export interface PlannedUtterance {
  regionIndex: number;
  split: UtteranceSplit;
  /** Box in the region's upright frame. */
  box: Box;
  crop: OcrCrop;
  engine: "baberu" | "manga-ocr";
  /** Writing mode of the region. textline-ori never flips a vertical region. */
  writingMode: "h" | "v";
  /**
   * Left-to-right crop of the single horizontal line (quarter turns [0]). Null for every other
   * utterance: textline-ori is trained on one horizontal line, not a whole block.
   */
  lineCrop: OcrCrop | null;
  /** The structure OCR of a horizontal utterance's lines, joined; null for vertical text and when no line was read. */
  lineReading: LineReading | null;
  /** Median thickness of the utterance's own line rectangles; null for a region read whole, without lines. */
  lineThickness: number | null;
  /** Where the utterance's lines stand in the region's `lines`. */
  lineIndexes: number[];
}
