/** Dots that only ever stand for a pause: every run of them, however long, is one ellipsis. */
const leaderDots = "…‥⋯";
/** Interpuncts: a pause when left over from a row of dots, a separator inside a transliterated name. */
const interpuncts = "·・･•‧";
/** Sentence periods: one on its own ends a sentence, in a row of dots it is one of the dots. */
const periods = ".．。｡";

const dotRun = new RegExp(`[${leaderDots}${interpuncts}${periods}]+`, "gu");
const isLetter = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * True when the source separates name parts with an interpunct ("リン・ハート"): a single one with katakana,
 * Latin letters, hangul or Han on both sides. A row of dots read as one dot sits beside hiragana or a mark.
 */
const hasNameInterpunct = (source: string) => {
  const chars = [...source];
  const partOfName = (char: string | undefined) => char !== undefined && /[\p{Script=Katakana}ー\p{Script=Latin}\p{Script=Hangul}\p{Script=Han}]/u.test(char);
  return chars.some((char, index) => interpuncts.includes(char) && partOfName(chars[index - 1]) && partOfName(chars[index + 1]));
};

/**
 * One ellipsis for every row of dots in a translation, whatever the row was made of and however long it
 * was: readers and translators render "・・・", "．．．．" or "……・" each in their own way, and the page ended
 * up with one dot here and four there. A period that closes a row of dots goes with it: Chinese sets none
 * after an ellipsis. A sentence period on its own stays, and so does the interpunct inside a name when the
 * source has one.
 */
export const unifyEllipses = (target: string, source: string) => {
  const keepInterpuncts = hasNameInterpunct(source);
  return target.replace(dotRun, (run, offset: number) => {
    if ([...run].length > 1) return "…";
    if (periods.includes(run)) return run;
    if (!interpuncts.includes(run)) return "…";
    const before = [...target.slice(0, offset)].at(-1);
    const after = [...target.slice(offset + run.length)][0];
    return keepInterpuncts && isLetter(before) && isLetter(after) ? run : "…";
  });
};
