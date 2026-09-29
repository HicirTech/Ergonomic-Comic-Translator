import type { SourceLanguage } from "../../translate/interfaces/index.ts";

/** Fewer letters than this say nothing reliable about the language. */
const minLetters = 20;
/** Korean text is mostly Hangul; a few Hangul letters in Japanese SFX do not make a page Korean. */
const minHangulShare = 0.3;
/** Japanese always mixes kana into kanji; Chinese has none. */
const minKanaShareOfCjk = 0.05;

/**
 * Picks the source language from recognised text by script counts: Hangul -> ko, kanji with kana -> ja,
 * Han only -> zh-Hant (the only Chinese source), otherwise Latin -> en. Null when there is too little
 * text. `confidence` is the share of letters in the deciding scripts.
 */
export const detectSourceLanguage = (texts: readonly string[]): { language: SourceLanguage; confidence: number } | null => {
  let kana = 0;
  let hangul = 0;
  let han = 0;
  let latin = 0;
  for (const text of texts) {
    kana += text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
    hangul += text.match(/\p{Script=Hangul}/gu)?.length ?? 0;
    han += text.match(/\p{Script=Han}/gu)?.length ?? 0;
    latin += text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  }
  const total = kana + hangul + han + latin;
  if (total < minLetters) {
    return null;
  }
  if (hangul >= minHangulShare * total) {
    return { language: "ko", confidence: hangul / total };
  }
  if (kana + han >= latin) {
    return kana >= minKanaShareOfCjk * (kana + han)
      ? { language: "ja", confidence: (kana + han) / total }
      : { language: "zh-Hant", confidence: han / total };
  }
  return { language: "en", confidence: latin / total };
};

/** Japanese and Chinese comics read right to left unless the user says otherwise. */
export const defaultReadingDirection = (language: SourceLanguage) => (language === "ja" || language === "zh-Hant" ? "rtl" : "ltr");
