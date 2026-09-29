// Decoding loop ported from genshiai-daichi/baberu-ocr onnx_infer.py (Apache-2.0).
import type { BaberuDecodeParams, OcrReading } from "./interfaces/index.ts";
import { argmaxWithProbability, softmaxProbability, summarizeProbabilities } from "./token-math.ts";

export const baberuDecodeDefaults: BaberuDecodeParams = { maxNewTokens: 128, repetitionPenalty: 1.2, maxContentRun: 12 };

const bosToken = 1;
const eosToken = 2;
const firstCharacterToken = 4;

/** Character vocabulary: ids 0-3 are <pad>/<bos>/<eos>/<unk>, id >= 4 is charset[id - 4]. */
export const createBaberuVocabulary = (charset: readonly string[]) => {
  const contentIds = new Set<number>();
  charset.forEach((char, index) => {
    // Letters and digits (not the long-vowel mark or tildes, which legitimately repeat) count as content.
    if ([...char].length === 1 && !"ーｰ〜~".includes(char) && /^[\p{L}\p{N}]$/u.test(char)) {
      contentIds.add(index + firstCharacterToken);
    }
  });
  return {
    size: charset.length + firstCharacterToken,
    contentIds,
    decode: (ids: readonly number[]) => ids.filter((id) => id >= firstCharacterToken).map((id) => charset[id - firstCharacterToken] ?? "").join(""),
  };
};

export type BaberuVocabulary = ReturnType<typeof createBaberuVocabulary>;

/**
 * Adjusts logits in place before the argmax, exactly like the reference: repetition penalty over every
 * token seen so far (bos included), then forbids a content character that already ran maxContentRun times.
 */
export const shapeBaberuLogits = (
  logits: Float64Array,
  seen: ReadonlySet<number>,
  emitted: readonly number[],
  vocabulary: BaberuVocabulary,
  params: BaberuDecodeParams,
) => {
  if (params.repetitionPenalty !== 1) {
    for (const id of seen) {
      const score = logits[id]!;
      logits[id] = score < 0 ? score * params.repetitionPenalty : score / params.repetitionPenalty;
    }
  }
  const last = emitted[emitted.length - 1];
  if (params.maxContentRun > 0 && last !== undefined && vocabulary.contentIds.has(last)) {
    let run = 0;
    for (let index = emitted.length - 1; index >= 0 && emitted[index] === last; index -= 1) run += 1;
    if (run >= params.maxContentRun) logits[last] = -Infinity;
  }
};

/**
 * Greedy KV-cache decoding: `prefillLogits` are the logits after <bos>; `step(token, position)` runs the
 * step decoder and returns the next logits. Confidence is the softmax probability of each chosen token
 * under the raw (unshaped) logits.
 */
export const decodeBaberu = async (
  prefillLogits: Float32Array,
  visionTokens: number,
  step: (token: number, position: number) => Promise<Float32Array>,
  vocabulary: BaberuVocabulary,
  params: BaberuDecodeParams = baberuDecodeDefaults,
): Promise<OcrReading> => {
  const seen = new Set<number>([bosToken]);
  const emitted: number[] = [];
  const probabilities: number[] = [];
  let raw = prefillLogits;
  let position = visionTokens + 1;
  for (let count = 0; count < params.maxNewTokens; count += 1) {
    const shaped = Float64Array.from(raw);
    shapeBaberuLogits(shaped, seen, emitted, vocabulary, params);
    const { index: next } = argmaxWithProbability(shaped, 0, shaped.length);
    if (next === eosToken) break;
    probabilities.push(softmaxProbability(raw, next));
    emitted.push(next);
    seen.add(next);
    if (emitted.length >= params.maxNewTokens) break;
    raw = await step(next, position);
    position += 1;
  }
  return summarizeProbabilities(vocabulary.decode(emitted), probabilities);
};
