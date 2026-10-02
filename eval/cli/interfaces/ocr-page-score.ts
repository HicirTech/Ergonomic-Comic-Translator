import type { Box } from "../../../src/geometry/interfaces/index.ts";
import type { RegionClass } from "../../../src/stages/regions/interfaces/index.ts";
import type { LayoutKind } from "../../synthetic/interfaces/index.ts";
import type { SearchCandidate } from "./search-candidate.ts";

/** One ground-truth block after the vision page, including the text that would be translated. */
export interface OcrBlockScore {
  blockId: string;
  kind: LayoutKind;
  direction: "h" | "v";
  sentenceKey: string;
  box: Box;
  /** `missed` is not a writing-mode or rotation decision; CER is still 1. */
  matchType: "single" | "merged" | "split" | "missed";
  iou: number;
  predictedDirection: "h" | "v" | null;
  /** Null when the region was missed or its utterances do not share one engine and turn. */
  productEngine: "baberu" | "manga-ocr" | null;
  productQuarterTurns: number | null;
  writingModeMatch: boolean;
  sentenceRotationMatch: boolean;
  /** Null when the block matched no region. */
  classification: RegionClass | null;
  /**
   * Pipeline utterances of the matched region, in order. `flags` is what the pipeline stored
   * (ORIENT_UNSURE, OCR_EMPTY). textline-ori does not add its own code: a 180-degree flip shows up
   * as `quarterTurns` two past the search winner.
   */
  pipelineUtterances: { quarterTurns: number; flags: string[] }[];
  /**
   * Null when the block was missed or every matched region was planned at turn 0 only.
   * Otherwise one entry per turn of each utterance whose planQuarterTurns had more than one entry.
   */
  searchCandidates: SearchCandidate[] | null;
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
