/**
 * Reading scores for one layout kind.
 * Precision is omitted: predicted boxes carry no kind, so only recall is per kind.
 */
export interface OcrKindSummary {
  blocks: number;
  /** Share of blocks a region covers by at least half. Same rule as block matching. */
  recall: number;
  single: number;
  merged: number;
  split: number;
  missed: number;
  /** Mean CER of the text pageText would send to translation. */
  cer: number;
  /** Null when every block of this kind was missed. */
  writingModeAccuracy: number | null;
  lineOrderAccuracy: number | null;
  /** Mean of the line recognizer's best-turn CER. Null when the kind has no lines. */
  lineBestCer: number | null;
  /** Mean CER at the pipeline's turn, skipping blocks with no single chosen turn. */
  baberuProductCer: number | null;
  baberuBestCer: number | null;
  mangaOcrProductCer: number | null;
  mangaOcrBestCer: number | null;
}
