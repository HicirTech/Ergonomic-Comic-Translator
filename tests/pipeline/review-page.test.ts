import { describe, expect, it } from "bun:test";
import { ChatHttpError } from "../../src/llm/chat-http-error.ts";
import type { ChatRequest, ChatResult } from "../../src/llm/interfaces/index.ts";
import { reviewPage } from "../../src/pipeline/review-page.ts";
import type { TranslationUnit } from "../../src/translate/interfaces/index.ts";

const unit = (id: string, source: string): TranslationUnit => ({ id, kind: "dialogue", source });

const completion = (content: string): ChatResult => ({
  content,
  reasoningContent: "",
  finishReason: "stop",
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
  generationTokensPerSecond: null,
  elapsedMs: 0,
});

const answerFor = (request: ChatRequest) => {
  const { 译文 } = JSON.parse(request.messages.at(-1)!.content) as { 译文: string };
  return 译文.includes("不对") ? completion("{\"verdict\":\"doubt\",\"reason\":\"意思反了\"}") : completion("{\"verdict\":\"ok\",\"reason\":\"\"}");
};

describe("reviewPage", () => {
  it("flags the units the reviewer doubts, with its reason, and leaves out units without a translation", async () => {
    const doubts = await reviewPage([unit("1", "一緒に行くよ"), unit("2", "ちょっと待って"), unit("3", "それは嫌だ")], { "1": "一起走吧", "2": "不对，等等" }, async (request) => answerFor(request), "m");
    expect(doubts).toEqual({ "2": "意思反了" });
  });

  it("does not ask about a cry or a lone word", async () => {
    const asked: string[] = [];
    const doubts = await reviewPage([unit("1", "イケ♥"), unit("2", "もじ"), unit("3", "行くよ、待って")], { "1": "不对", "2": "不对", "3": "不对，等等" }, async (request) => {
      asked.push((JSON.parse(request.messages.at(-1)!.content) as { 原文: string }).原文);
      return answerFor(request);
    }, "m");
    expect(asked).toEqual(["行くよ、待って"]);
    expect(doubts).toEqual({ "3": "意思反了" });
  });

  it("leaves a unit unflagged when its review request fails, and reviews the rest", async () => {
    let calls = 0;
    const doubts = await reviewPage([unit("1", "一緒に行くよ"), unit("2", "ちょっと待って")], { "1": "不对", "2": "不对" }, async (request) => {
      calls += 1;
      if (calls === 1) throw new ChatHttpError(503, "loading");
      return answerFor(request);
    }, "m");
    expect(doubts).toEqual({ "2": "意思反了" });
  });

  it("asks with a seed that follows the source and the translation, so a re-run reviews alike", async () => {
    const seeds: number[] = [];
    const record = async (request: ChatRequest) => {
      seeds.push(request.seed);
      return answerFor(request);
    };
    await reviewPage([unit("1", "一緒に行くよ")], { "1": "一起走吧" }, record, "m");
    await reviewPage([unit("1", "一緒に行くよ")], { "1": "一起走吧" }, record, "m");
    await reviewPage([unit("1", "一緒に行くよ")], { "1": "一起走了" }, record, "m");
    expect(seeds[0]).toBe(seeds[1]!);
    expect(seeds[2]).not.toBe(seeds[0]!);
  });
});
