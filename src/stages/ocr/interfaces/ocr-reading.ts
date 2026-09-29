/** One recognition result with its token confidence (softmax probability of each chosen token). */
export interface OcrReading {
  text: string;
  /** Mean probability of the emitted tokens; 0 when nothing was emitted. */
  meanProb: number;
  /** Lowest token probability; 0 when nothing was emitted. */
  minProb: number;
  tokens: number;
}
