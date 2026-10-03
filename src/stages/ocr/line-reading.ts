import type { LineReading, OcrReading } from "./interfaces/index.ts";

/** A line of at most this many characters read below trustedLineProb is a DB splinter or a stray mark: left out. */
const splinterChars = 2;
const trustedLineProb = 0.8;
/** The joined lines replace the sentence reading only when every line reached this mean probability. */
const confidentLineProb = 0.85;
/** A sentence reading below this mean probability is unsure. */
const unsureSentenceProb = 0.8;
/** A sentence reading with fewer than this share of the lines' characters lost text. */
const lostTextShare = 0.8;

const charCount = (text: string) => [...text.replace(/\s/gu, "")].length;

/** Joins an utterance's per-line readings, given in reading order. Null when no line was read. */
export const joinLineReadings = (lines: readonly (OcrReading | undefined)[]): LineReading | null => {
  const kept = lines.filter((line): line is OcrReading =>
    line !== undefined && charCount(line.text) > 0 && !(charCount(line.text) <= splinterChars && line.meanProb < trustedLineProb));
  if (kept.length === 0) return null;
  const total = kept.reduce((sum, line) => sum + charCount(line.text), 0);
  return {
    text: kept.map((line) => line.text.trim()).join(""),
    meanProb: kept.reduce((sum, line) => sum + line.meanProb * charCount(line.text), 0) / total,
    lowestLineProb: Math.min(...kept.map((line) => line.meanProb)),
  };
};

/**
 * The sentence readers squeeze an utterance into a fixed square, so a wide or long one (a dialogue box
 * across the page) comes back with characters missing, while the line recognizer reads each of its lines
 * at full size. The joined lines win when every line was read with confidence and the sentence reading is
 * empty, unsure, or shorter than the lines by a fifth. Otherwise the sentence reading stays: it reads
 * vertical and stylised text better than the line recognizer does.
 */
export const preferLineReading = (sentence: OcrReading | null, lines: LineReading | null) => {
  if (!lines || lines.lowestLineProb < confidentLineProb) return false;
  if (!sentence || sentence.text === "") return true;
  return sentence.meanProb < unsureSentenceProb || charCount(sentence.text) < lostTextShare * charCount(lines.text);
};
