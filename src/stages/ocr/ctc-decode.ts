import type { OcrReading } from "./interfaces/index.ts";
import { summarizeProbabilities } from "./token-math.ts";

/**
 * PP-OCR's character list for CTC: index 0 is the blank, then the model's character_dict,
 * then a trailing space (use_space_char).
 */
export const ctcCharacters = (characterDict: readonly unknown[]) => ["", ...characterDict.map(String), " "];

/**
 * Greedy CTC decoding of per-timestep probabilities (the PP-OCR rec output is already softmaxed):
 * take the best class per step, collapse repeats, drop blanks.
 */
export const ctcGreedyDecode = (
  probabilities: ArrayLike<number>,
  steps: number,
  classes: number,
  characters: readonly string[],
): OcrReading => {
  let text = "";
  const kept: number[] = [];
  let previous = -1;
  for (let step = 0; step < steps; step += 1) {
    const offset = step * classes;
    let best = 0;
    let bestProbability = -1;
    for (let index = 0; index < classes; index += 1) {
      const value = probabilities[offset + index]!;
      if (value > bestProbability) {
        bestProbability = value;
        best = index;
      }
    }
    if (best !== 0 && best !== previous) {
      text += characters[best] ?? "";
      kept.push(bestProbability);
    }
    previous = best;
  }
  return summarizeProbabilities(text, kept);
};
