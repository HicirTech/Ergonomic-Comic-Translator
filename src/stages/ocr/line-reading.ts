import { detectSourceLanguage } from "../lang/detect-language.ts";
import type { LineReading, OcrReading } from "./interfaces/index.ts";

/** A line of at most this many characters read below trustedLineProb is a DB splinter or a stray mark: left out. */
const splinterChars = 2;
const trustedLineProb = 0.8;
/** A line read at this mean probability or more was read with confidence. */
const confidentLineProb = 0.85;
/** A sentence reading below this mean probability is unsure. */
const unsureSentenceProb = 0.8;
/** A sentence reading with fewer than this share of the lines' characters lost text. */
const lostTextShare = 0.8;
/** Lines read this much more surely on average than an unsure sentence reading replace it, weak line or not. */
const clearlySurerBy = 0.1;
/** From this many characters on, the sentence readers misread text and still report it as sure. */
const longTextChars = 40;

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

/** The detector cuts Latin lines into words, and their order along a line is not reliable. */
const isLatinText = (text: string) => detectSourceLanguage([text])?.language === "en";

/**
 * Whether the joined lines are the reading of a horizontal utterance. The sentence readers squeeze an
 * utterance into a fixed square: a long one (a dialogue box across the page) comes back with characters
 * wrong or missing, and their confidence does not show it, while the line recognizer reads each line at
 * full size. Short text and Latin text keep a sure, whole sentence reading: there the sentence readers are
 * the better readers. One weak line is still better than a sentence read unsure throughout.
 */
export const preferLineReading = (sentence: OcrReading | null, lines: LineReading | null) => {
  if (!lines) return false;
  const everyLineSure = lines.lowestLineProb >= confidentLineProb;
  if (!sentence || sentence.text === "") return everyLineSure;
  const unsure = sentence.meanProb < unsureSentenceProb;
  if (unsure && lines.meanProb - sentence.meanProb >= clearlySurerBy) return true;
  if (!everyLineSure) return false;
  const long = charCount(lines.text) >= longTextChars && !isLatinText(lines.text);
  return long || unsure || charCount(sentence.text) < lostTextShare * charCount(lines.text);
};
