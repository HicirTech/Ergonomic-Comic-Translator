import { describe, expect, it } from "bun:test";
import { baberuDecodeDefaults, createBaberuVocabulary, decodeBaberu, shapeBaberuLogits } from "../../src/stages/ocr/baberu-decode.ts";
import { ctcCharacters, ctcGreedyDecode } from "../../src/stages/ocr/ctc-decode.ts";
import { decodeMangaOcrTokens, greedyDecodeMangaOcr, mangaOcrPostProcess } from "../../src/stages/ocr/manga-ocr-decode.ts";
import { softmaxProbability } from "../../src/stages/ocr/token-math.ts";

/** Logits over `size` classes with one clear winner. */
const peaked = (size: number, winner: number, height = 8) => {
  const logits = new Float32Array(size);
  logits[winner] = height;
  return logits;
};

describe("ctcGreedyDecode", () => {
  it("collapses repeats, drops blanks and keeps a repeat separated by a blank", () => {
    const characters = ctcCharacters(["あ", "い"]);
    // steps: あ あ blank あ い blank
    const winners = [1, 1, 0, 1, 2, 0];
    const probabilities = new Float32Array(winners.length * characters.length);
    winners.forEach((winner, step) => {
      probabilities[step * characters.length + winner] = 0.9;
    });
    expect(ctcGreedyDecode(probabilities, winners.length, characters.length, characters)).toEqual({
      text: "あああい".slice(1),
      meanProb: expect.closeTo(0.9, 6),
      minProb: expect.closeTo(0.9, 6),
      tokens: 3,
    });
  });

  it("adds the blank at 0 and the space at the end of the dictionary", () => {
    expect(ctcCharacters(["a", 1])).toEqual(["", "a", "1", " "]);
  });
});

describe("manga-ocr decoding", () => {
  const vocabulary = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]", "お", "##は", "よう", "!"];

  it("post-processes like the reference package", () => {
    // jaconv.h2z(ascii=True) also widens the dots, as the reference does.
    expect(mangaOcrPostProcess("お は よう … ・・ AB1!")).toBe("おはよう．．．．．ＡＢ１！");
    expect(mangaOcrPostProcess("ｶﾞﾝﾊﾞ")).toBe("ガンバ");
  });

  it("strips word-piece markers and special tokens", () => {
    expect(decodeMangaOcrTokens([5, 6, 7, 3], vocabulary)).toBe("おはよう");
  });

  it("feeds all tokens each step and stops at [SEP]", async () => {
    const script = [5, 6, 7, 8, 3];
    const inputs: number[][] = [];
    const reading = await greedyDecodeMangaOcr(async (ids) => {
      inputs.push([...ids]);
      return peaked(vocabulary.length, script[ids.length - 1]!);
    }, vocabulary, 300);
    expect(reading.text).toBe("おはよう！");
    expect(inputs[0]).toEqual([2]);
    expect(inputs[3]).toEqual([2, 5, 6, 7]);
    expect(reading.tokens).toBe(4);
  });

  it("stops at the length limit", async () => {
    const reading = await greedyDecodeMangaOcr(async () => peaked(vocabulary.length, 5), vocabulary, 7);
    expect(reading.tokens).toBe(7);
  });
});

describe("Baberu decoding", () => {
  const charset = ["\t", " ", "あ", "ー", "!", "1"];
  const vocabulary = createBaberuVocabulary(charset);
  const id = (char: string) => charset.indexOf(char) + 4;

  it("maps ids 4+ to the charset and knows which characters are content", () => {
    expect(vocabulary.decode([1, id("あ"), id("ー"), 2])).toBe("あー");
    expect([...vocabulary.contentIds].sort()).toEqual([id("あ"), id("1")].sort());
  });

  it("applies the repetition penalty to seen tokens by the sign of their logit", () => {
    const logits = Float64Array.from([0, 0, 0, 0, 0, 0, 2.4, -1]);
    shapeBaberuLogits(logits, new Set([id("あ"), 7]), [], vocabulary, baberuDecodeDefaults);
    expect(logits[id("あ")]).toBeCloseTo(2, 9);
    expect(logits[7]).toBeCloseTo(-1.2, 9);
  });

  it("caps a content character after 12 repeats but lets the long-vowel mark run", async () => {
    const size = vocabulary.size;
    const aThenOne = () => {
      const logits = peaked(size, id("あ"), 50);
      logits[id("1")] = 10;
      return logits;
    };
    const capped = await decodeBaberu(aThenOne(), 256, async () => aThenOne(), vocabulary, { ...baberuDecodeDefaults, maxNewTokens: 20 });
    expect(capped.text.startsWith("あ".repeat(12))).toBe(true);
    expect(capped.text[12]).toBe("1");

    const alwaysDash = async () => peaked(size, id("ー"), 50);
    const dashes = await decodeBaberu(peaked(size, id("ー"), 50), 256, alwaysDash, vocabulary, { ...baberuDecodeDefaults, maxNewTokens: 20 });
    expect(dashes.text).toBe("ー".repeat(20));
  });

  it("starts step positions after the vision tokens and bos, and stops at eos", async () => {
    const positions: number[] = [];
    const script = [id("1"), 2];
    const reading = await decodeBaberu(peaked(vocabulary.size, id("あ")), 256, async (_, position) => {
      positions.push(position);
      return peaked(vocabulary.size, script[positions.length - 1]!);
    }, vocabulary);
    expect(reading.text).toBe("あ1");
    expect(positions).toEqual([257, 258]);
    expect(reading.meanProb).toBeGreaterThan(0.9);
  });
});

describe("softmaxProbability", () => {
  it("matches a direct softmax", () => {
    expect(softmaxProbability([1, 2, 3], 2)).toBeCloseTo(Math.exp(3) / (Math.exp(1) + Math.exp(2) + Math.exp(3)), 9);
  });
});
