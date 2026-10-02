/**
 * Reading scores for one layout kind.
 * Precision is omitted: predicted boxes carry no kind, so only recall is per kind.
 */
export interface OcrKindSummary {
  blocks: number;
  recall: number;
  /** Mean CER of the text pageText would send to translation. */
  cer: number;
  writingModeAccuracy: number;
  lineOrderAccuracy: number | null;
  /** Mean of the line recognizer's best-turn CER. Null when the kind has no lines. */
  lineBestCer: number | null;
  /** Mean CER at the pipeline's turn, skipping blocks with no single chosen turn. */
  baberuProductCer: number | null;
  baberuBestCer: number | null;
  mangaOcrProductCer: number | null;
  mangaOcrBestCer: number | null;
}
