import type { OcrReading } from "./interfaces/index.ts";
import { argmaxWithProbability, summarizeProbabilities } from "./token-math.ts";

/** manga-ocr (BERT tokenizer): [PAD]=0, [UNK]=1, [CLS]=2 starts decoding, [SEP]=3 ends it, [MASK]=4. */
export const mangaOcrStartToken = 2;
export const mangaOcrEndToken = 3;
const lastSpecialToken = 4;

/**
 * Post-processing of the reference manga-ocr package: drop whitespace, turn "…" into "...", normalise
 * runs of dots, then convert half-width characters to full-width (jaconv.h2z with ascii and digits).
 */
export const mangaOcrPostProcess = (raw: string) => {
  let text = raw.split(/\s+/u).join("");
  text = text.replaceAll("…", "...");
  text = text.replace(/[・.]{2,}/gu, (match) => ".".repeat(match.length));
  text = text.replace(/[｡-ﾟ]+/gu, (match) => match.normalize("NFKC"));
  return text.replace(/[!-~]/gu, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
};

export const decodeMangaOcrTokens = (ids: readonly number[], vocabulary: readonly string[]) =>
  mangaOcrPostProcess(ids.filter((id) => id > lastSpecialToken).map((id) => (vocabulary[id] ?? "").replace(/^##/u, "")).join(""));

/**
 * Greedy decoding for the manga-ocr ONNX export, whose decoder has no KV cache: every step feeds all
 * tokens so far. `nextLogits` returns the logits of the last position.
 */
export const greedyDecodeMangaOcr = async (
  nextLogits: (ids: readonly number[]) => Promise<Float32Array>,
  vocabulary: readonly string[],
  maxLength: number,
): Promise<OcrReading> => {
  const ids = [mangaOcrStartToken];
  const probabilities: number[] = [];
  for (let step = 0; step < maxLength; step += 1) {
    const logits = await nextLogits(ids);
    const { index, probability } = argmaxWithProbability(logits, 0, logits.length);
    if (index === mangaOcrEndToken) break;
    ids.push(index);
    probabilities.push(probability);
  }
  return summarizeProbabilities(decodeMangaOcrTokens(ids.slice(1), vocabulary), probabilities);
};
