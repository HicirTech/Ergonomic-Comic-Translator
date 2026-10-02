import type { Box } from "../../../src/geometry/interfaces/index.ts";
import type { LayoutKind } from "../../synthetic/interfaces/index.ts";

/** One ground-truth block after the vision page, including the text that would be translated. */
export interface OcrBlockScore {
  blockId: string;
  kind: LayoutKind;
  direction: "h" | "v";
  sentenceKey: string;
  box: Box;
  matched: boolean;
  iou: number;
  predictedDirection: "h" | "v" | null;
  /** Null when the region was missed or its utterances do not share one engine and turn. */
  productEngine: "baberu" | "manga-ocr" | null;
  productQuarterTurns: number | null;
  writingModeMatch: boolean;
  sentenceRotationMatch: boolean;
  reference: string;
  predicted: string;
  cer: number;
  /** Null when the block has fewer than 2 or more than 4 lines. */
  lineOrderMatch: boolean | null;
  baberuHypotheses: [string, string, string, string];
  baberuCerByTurn: [number, number, number, number];
  baberuBestTurn: number;
  /** CER at the pipeline's turn. Null when the pipeline did not choose one turn. */
  baberuProductCer: number | null;
  mangaOcrHypotheses: [string, string, string, string];
  mangaOcrCerByTurn: [number, number, number, number];
  mangaOcrBestTurn: number;
  mangaOcrProductCer: number | null;
}
