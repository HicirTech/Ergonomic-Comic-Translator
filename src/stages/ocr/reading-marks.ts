/** What a reader makes of a dakuten drawn after a kana (あ゛, a strained cry): quote-like marks, never quotes. */
const quoteLikeAfterKana = /(?<=[\p{Script=Hiragana}\p{Script=Katakana}ー])["“”゛゙]+/gu;

/** A reading without the dakuten marks a reader turned into quotes; Chinese has no mark for a strained cry. */
export const dropDakutenMarks = (text: string) => text.replace(quoteLikeAfterKana, "");
