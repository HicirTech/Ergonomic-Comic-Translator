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
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

const charCount = (text: string) => [...text.replace(/\s/gu, "")].length;
const lettersOf = (text: string) => [...text.normalize("NFKC")].filter((char) => /[\p{L}\p{N}]/u.test(char));

/** True when `part` is `whole` with characters left out, or the same. */
const isLeftOutOf = (part: readonly string[], whole: readonly string[]) => {
  let matched = 0;
  for (const char of whole) {
    if (matched < part.length && char === part[matched]) matched += 1;
  }
  return matched === part.length;
};

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
 * Whether the joined lines are the reading of a horizontal utterance. On Japanese text the sentence readers
 * put wrong characters in place and invent text while reporting it as sure, and the line recognizer at most
 * leaves a character out: lines read with confidence win unless they are the sentence reading with
 * characters missing. Text without kana keeps a sure, whole sentence reading. One weak line is still better
 * than a sentence read unsure throughout.
 */
export const preferLineReading = (sentence: OcrReading | null, lines: LineReading | null) => {
  if (!lines) return false;
  const everyLineSure = lines.lowestLineProb >= confidentLineProb;
  if (!sentence || sentence.text === "") return everyLineSure;
  const unsure = sentence.meanProb < unsureSentenceProb;
  if (unsure && lines.meanProb - sentence.meanProb >= clearlySurerBy) return true;
  if (!everyLineSure) return false;
  if (unsure) return true;
  return kana.test(lines.text)
    ? !isLeftOutOf(lettersOf(lines.text), lettersOf(sentence.text))
    : charCount(sentence.text) < lostTextShare * charCount(lines.text);
};
