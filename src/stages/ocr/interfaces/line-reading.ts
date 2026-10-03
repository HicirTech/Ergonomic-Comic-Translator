/** An utterance as the per-line recognizer reads it: its lines joined in reading order. */
export interface LineReading {
  text: string;
  /** Mean of the lines' mean probabilities, weighted by their character counts. */
  meanProb: number;
  /** Mean probability of the least confident line. */
  lowestLineProb: number;
}
