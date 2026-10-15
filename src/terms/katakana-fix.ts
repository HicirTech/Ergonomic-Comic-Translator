import type { JapaneseDictionary } from "./interfaces/index.ts";
import { japaneseHonorifics } from "./norm-key.ts";

/** Katakana runs of this length and more are words worth checking; shorter ones are too ambiguous to correct. */
const minRunChars = 3;
const katakanaRun = new RegExp(`[ァ-ヶー]{${minRunChars},}`, "gu");
/** Pairs readers confuse: a dakuten or handakuten dropped or added, a small kana read large or the reverse. */
const confusablePairs: readonly (readonly [string, string])[] = [
  ["カ", "ガ"], ["キ", "ギ"], ["ク", "グ"], ["ケ", "ゲ"], ["コ", "ゴ"], ["サ", "ザ"], ["シ", "ジ"], ["ス", "ズ"], ["セ", "ゼ"], ["ソ", "ゾ"],
  ["タ", "ダ"], ["チ", "ヂ"], ["ツ", "ヅ"], ["テ", "デ"], ["ト", "ド"], ["ウ", "ヴ"],
  ["ハ", "バ"], ["ハ", "パ"], ["バ", "パ"], ["ヒ", "ビ"], ["ヒ", "ピ"], ["ビ", "ピ"], ["フ", "ブ"], ["フ", "プ"], ["ブ", "プ"],
  ["ヘ", "ベ"], ["ヘ", "ペ"], ["ベ", "ペ"], ["ホ", "ボ"], ["ホ", "ポ"], ["ボ", "ポ"],
  ["ツ", "ッ"], ["ヤ", "ャ"], ["ユ", "ュ"], ["ヨ", "ョ"], ["ア", "ァ"], ["イ", "ィ"], ["ウ", "ゥ"], ["エ", "ェ"], ["オ", "ォ"], ["ワ", "ヮ"],
];
const confusedWith = new Map<string, string[]>();
for (const [a, b] of confusablePairs) {
  confusedWith.set(a, [...(confusedWith.get(a) ?? []), b]);
  confusedWith.set(b, [...(confusedWith.get(b) ?? []), a]);
}
const honorificAhead = new RegExp(`^(?:${japaneseHonorifics.join("|")})`, "u");
/** A run right after a kanji is the tail of a compound (野ション), not a word of its own. */
const kanjiBefore = /\p{Script=Han}$/u;

/** The one dictionary word a misread run can be (one character read as one it is confused with), or null. */
export const correctedRun = (run: string, dictionary: JapaneseDictionary): string | null => {
  if (dictionary.has(run)) return null;
  const chars = [...run];
  const words = new Set<string>();
  chars.forEach((char, index) => {
    for (const other of confusedWith.get(char) ?? []) {
      const variant = [...chars.slice(0, index), other, ...chars.slice(index + 1)].join("");
      if (dictionary.has(variant)) words.add(variant);
    }
  });
  return words.size === 1 ? [...words][0]! : null;
};

/**
 * The text with every misread katakana word replaced by the one word it can be, and the replacements made.
 * A run followed by an honorific is a name, and one right after a kanji is part of a compound: both stay,
 * whatever the dictionary says.
 */
export const correctKatakana = (text: string, dictionary: JapaneseDictionary) => {
  const changes: [from: string, to: string][] = [];
  const corrected = text.replace(katakanaRun, (run, offset: number) => {
    if (kanjiBefore.test(text.slice(0, offset)) || honorificAhead.test(text.slice(offset + run.length))) return run;
    const word = correctedRun(run, dictionary);
    if (word === null) return run;
    changes.push([run, word]);
    return word;
  });
  return { text: corrected, changes };
};

/** The correction as a function of the text alone, for the stage that turns readings into units. */
export const katakanaCorrector = (dictionary: JapaneseDictionary) => (text: string) => correctKatakana(text, dictionary).text;
