import { describe, expect, it } from "bun:test";
import type { ChatResult } from "../../src/llm/interfaces/index.ts";
import { checkCompletion, hasResidue, isDegenerate, isEcho, isRefusal } from "../../src/qa/decisive-checks.ts";
import { buildMessages, buildSingleTurnMessages, maxTokensFor, outputSchema, unitId } from "../../src/translate/contract.ts";
import { historyWindowStart, sourceTokens } from "../../src/translate/history-window.ts";
import type { PageRequest, TranslationUnit } from "../../src/translate/interfaces/index.ts";
import { translatePage } from "../../src/translate/translate-page.ts";

const unit = (id: string, source: string, kind: TranslationUnit["kind"] = "dialogue"): TranslationUnit => ({ id, kind, source });

const request = (units: TranslationUnit[]): PageRequest => ({
  language: "ja",
  page: 3,
  units,
  glossary: [{ source: "リン", target: "琳", note: "女主角" }],
  matchingTerms: [{ source: "リン", target: "琳" }],
  history: [{ page: 2, units: [unit("1", "おはよう")], targets: { "1": "早上好" } }],
});

const completion = (content: string, overrides: Partial<ChatResult> = {}): ChatResult => ({
  content,
  reasoningContent: "",
  finishReason: "stop",
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
  generationTokensPerSecond: null,
  elapsedMs: 0,
  ...overrides,
});

describe("tr-contract@2 messages", () => {
  it("puts contract and glossary in one system message, history as pairs, the page last", () => {
    const messages = buildMessages(request([unit("1", "リン、行くよ")]));
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[0]!.content).toContain("リン → 琳（女主角）");
    expect(JSON.parse(messages[2]!.content)).toEqual({ "1": "早上好" });
    expect(JSON.parse(messages[3]!.content)).toEqual({ page: 3, terms: [{ source: "リン", target: "琳" }], units: [{ id: "1", kind: "dialogue", source: "リン、行くよ" }] });
  });

  it("keeps the prefix identical when only the current page changes", () => {
    const a = buildMessages(request([unit("1", "A")]));
    const b = buildMessages(request([unit("1", "B"), unit("2", "C")]));
    expect(a.slice(0, 3)).toEqual(b.slice(0, 3));
  });

  it("folds everything into one user turn for single-turn models", () => {
    const [message, ...rest] = buildSingleTurnMessages(request([unit("1", "リン")]));
    expect(rest).toEqual([]);
    expect(message!.role).toBe("user");
    expect(message!.content).toContain("おはよう → 早上好");
  });

  it("builds a strict flat schema, token caps and utterance ids", () => {
    expect(outputSchema(["1", "2a"])).toEqual({
      type: "object",
      properties: { "1": { type: "string", minLength: 1 }, "2a": { type: "string", minLength: 1 } },
      required: ["1", "2a"],
      additionalProperties: false,
    });
    expect(maxTokensFor(20)).toBe(864);
    expect(maxTokensFor(100)).toBe(2048);
    expect([unitId(12, 0, 1), unitId(12, 0, 2), unitId(12, 1, 2)]).toEqual(["12", "12a", "12b"]);
  });
});

describe("history window", () => {
  it("drops to the low-water mark when the budget is exceeded, so the start moves in jumps", () => {
    const pages = [400, 400, 400, 400, 400, 400];
    const starts = pages.map((_, index) => historyWindowStart(pages.slice(0, index + 1), 2000));
    // 2400 > 2000 drops pages until at most 1000 remain: two pages of 400.
    expect(starts).toEqual([0, 0, 0, 0, 0, 4]);
  });

  it("depends only on source lengths and skips a single oversized page", () => {
    expect(historyWindowStart([100, 5000], 2000)).toBe(2);
    expect(sourceTokens([unit("1", "あいう"), unit("2", "え")])).toBe(3 + 8 + 1 + 8);
  });
});

describe("decisive checks", () => {
  it("detects refusal and meta talk only when the source has none", () => {
    expect(isRefusal("行くぞ", "作为AI，我无法翻译这段内容")).toBe(true);
    expect(isRefusal("I can't translate it", "I can't translate it")).toBe(false);
  });

  it("detects echoes, kana residue and degenerate repetition", () => {
    expect(isEcho("おはよう！", "おはよう")).toBe(true);
    expect(isEcho("ああっ", "啊啊")).toBe(false);
    expect(hasResidue("你好です")).toBe(true);
    expect(hasResidue("啊——ー")).toBe(false);
    expect(isDegenerate("あ", "哈".repeat(12))).toBe(true);
    expect(isDegenerate("あああああああああああ", "啊".repeat(12))).toBe(false);
  });

  it("fails the whole page on structure problems and single units on content problems", () => {
    const units = [unit("1", "行く"), unit("2", "待って"), unit("3", "ドン", "sfx")];
    expect(checkCompletion(units, completion("{\"1\":\"走")).pageFailures).toContain("G0_JSON");
    expect(checkCompletion(units, completion("{}", { finishReason: "length" })).retryIds).toEqual(["1", "2", "3"]);
    expect(checkCompletion(units, completion("{}", { reasoningContent: "hmm" })).pageFailures).toContain("G0_REASONING");
    const partial = checkCompletion(units, completion("{\"1\":\"走\",\"2\":\"待って\",\"3\":\"咚\",\"9\":\"x\"}"));
    expect(partial.pageFailures).toEqual(["G0_KEYS"]);
    expect(partial.retryIds).toEqual(["2"]);
    // Failing candidates stay available: the ladder may still render the best Chinese one.
    expect(partial.targets).toEqual({ "1": "走", "2": "待って", "3": "咚" });
  });
});

describe("translatePage", () => {
  it("retries only failing units: same seed, then a new seed, then one unit at a time", async () => {
    const calls: { ids: string[]; seed: number }[] = [];
    const units = [unit("1", "行く"), unit("2", "待って"), unit("3", "嫌だ")];
    const result = await translatePage(request(units), async (messages, schema, _maxTokens, seed) => {
      const ids = (schema.required as string[]);
      calls.push({ ids, seed });
      const answers: Record<string, string> = {};
      for (const id of ids) {
        if (id === "1") answers[id] = "走";
        if (id === "2" && calls.length >= 3) answers[id] = "等等";
        if (id === "3" && ids.length === 1) answers[id] = "不要";
      }
      return completion(JSON.stringify(answers));
    }, 100);
    expect(result.targets).toEqual({ "1": "走", "2": "等等", "3": "不要" });
    expect(result.failures).toEqual({});
    expect(calls).toEqual([
      { ids: ["1", "2", "3"], seed: 100 },
      { ids: ["2", "3"], seed: 100 },
      { ids: ["2", "3"], seed: 101 },
      { ids: ["3"], seed: 102 },
    ]);
  });

  it("reports units that never pass so the fallback ladder can take them", async () => {
    const result = await translatePage(request([unit("1", "行く")]), async () => completion("{\"1\":\"作为AI我无法翻译\"}"), 1);
    expect(result.targets).toEqual({});
    expect(result.failures).toEqual({ "1": ["G1_REFUSAL"] });
    expect(result.requests).toBe(4);
  });

  it("keeps a complete answer that is only doubtful, still reported as failing", async () => {
    const answers: Record<string, string> = { "1": "はぁ…走了", "2": "OK", "3": `${"啊".repeat(12)}！` };
    const units = [unit("1", "はぁ…行く"), unit("2", "ＯＫ"), unit("3", "ああっ！")];
    const result = await translatePage(request(units), async (_messages, schema) =>
      completion(JSON.stringify(Object.fromEntries((schema.required as string[]).map((id) => [id, answers[id]])))), 1);
    expect(result.targets).toEqual(answers);
    expect(result.failures).toEqual({ "1": ["G3_RESIDUE"], "2": ["G1B_ECHO"], "3": ["G5_REPEAT"] });
    expect(result.requests).toBe(6);
  });

  it("does not keep a refusal, whatever else it failed", async () => {
    const result = await translatePage(request([unit("1", "行く")]), async () => completion("{\"1\":\"作为AI我无法翻译です\"}"), 1);
    expect(result.targets).toEqual({});
    expect(result.failures).toEqual({ "1": ["G1_REFUSAL", "G3_RESIDUE"] });
  });
});
