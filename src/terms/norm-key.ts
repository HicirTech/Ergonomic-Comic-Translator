/** Japanese honorific suffixes stripped from names (and kept separately for address terms). */
export const japaneseHonorifics = ["さん", "くん", "君", "ちゃん", "様", "さま", "先輩", "先生", "殿", "たん", "氏"] as const;
export const koreanHonorifics = ["씨", "님", "선배", "오빠", "언니", "형", "누나", "군", "양"] as const;

const honorificPattern = new RegExp(`(${[...japaneseHonorifics, ...koreanHonorifics].join("|")})$`, "u");

/** Hiragana to katakana by code point (U+3041-U+3096 -> U+30A1-U+30F6). */
export const toKatakana = (text: string) =>
  text.replace(/[ぁ-ゖ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));

/** Readers confuse small and large kana (アンデッド read as アンデツド), so a key does not tell them apart. */
const largeKana: Record<string, string> = { ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ", ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ", ヵ: "カ", ヶ: "ケ" };
const toLargeKana = (text: string) => text.replace(/[ァィゥェォッャュョヮヵヶ]/gu, (char) => largeKana[char]!);

/** Splits a trailing honorific off a name: "リンちゃん" -> { base: "リン", honorific: "ちゃん" }. */
export const splitHonorific = (text: string) => {
  const match = honorificPattern.exec(text);
  if (!match || match.index === 0) {
    return { base: text, honorific: null };
  }
  return { base: text.slice(0, match.index), honorific: match[1]! };
};

/**
 * Merge key for names and terms: NFKC, honorific stripped (before kana conversion, since honorifics are
 * written in hiragana), hiragana as katakana, small kana as large, runs of long-vowel marks and tildes
 * collapsed to one (a single mark stays, or ユーリ and ユリ would merge), spaces and middle dots removed.
 */
export const normKey = (surface: string) => {
  const { base } = splitHonorific(surface.normalize("NFKC").trim());
  const collapsed = toLargeKana(toKatakana(base)).replace(/([ー〜~～])\1+/gu, "$1");
  return collapsed.replace(/[\s・·]/gu, "");
};
