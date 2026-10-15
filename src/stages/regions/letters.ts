/** The letters and digits of a text: what there is to read, as against marks and punctuation. */
export const letterCount = (text: string) => [...text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
