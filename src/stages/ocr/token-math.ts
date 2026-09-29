import type { OcrReading } from "./interfaces/index.ts";

/** Index of the largest logit in [offset, offset + length) and its softmax probability. */
export const argmaxWithProbability = (logits: ArrayLike<number>, offset: number, length: number) => {
  let best = 0;
  let max = -Infinity;
  for (let index = 0; index < length; index += 1) {
    const value = logits[offset + index]!;
    if (value > max) {
      max = value;
      best = index;
    }
  }
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Math.exp(logits[offset + index]! - max);
  }
  return { index: best, probability: 1 / sum };
};

/** Softmax probability of one index under the given logits. */
export const softmaxProbability = (logits: ArrayLike<number>, target: number) => {
  let max = -Infinity;
  for (let index = 0; index < logits.length; index += 1) max = Math.max(max, logits[index]!);
  let sum = 0;
  for (let index = 0; index < logits.length; index += 1) sum += Math.exp(logits[index]! - max);
  return Math.exp(logits[target]! - max) / sum;
};

export const summarizeProbabilities = (text: string, probabilities: readonly number[]): OcrReading => ({
  text,
  meanProb: probabilities.length > 0 ? probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length : 0,
  minProb: probabilities.length > 0 ? Math.min(...probabilities) : 0,
  tokens: probabilities.length,
});
