import { describe, expect, it } from "bun:test";
import { ChatHttpError } from "../../src/llm/chat-http-error.ts";
import type { ChatMessage, ChatResult } from "../../src/llm/interfaces/index.ts";
import { isRetryableLlmError } from "../../src/llm/retryable.ts";
import { buildGlossary } from "../../src/pipeline/build-glossary.ts";
import type { RegionResult } from "../../src/pipeline/interfaces/index.ts";
import { translateVolume, translateVolumePage } from "../../src/pipeline/translate-volume.ts";
import { pageText } from "../../src/pipeline/volume-text.ts";
import type { FixedTerm } from "../../src/terms/interfaces/index.ts";
import type { CompleteFn } from "../../src/translate/interfaces/index.ts";
import { translatePage } from "../../src/translate/translate-page.ts";

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

const utterance = (text: string, overrides: Partial<RegionResult["utterances"][number]> = {}): RegionResult["utterances"][number] => ({
  box: { x0: 0, y0: 0, x1: 1, y1: 1 },
  lineIndexes: [],
  startReasons: [],
  nameTag: false,
  thought: false,
  text,
  meanProb: 0.9,
  minProb: 0.8,
  engine: "baberu",
  textFrom: "sentence",
  quarterTurns: 0,
  flags: [],
  ...overrides,
});

const region = (x0: number, y0: number, texts: string[], policy: "translate" | "keep" = "translate"): RegionResult => ({
  box: { x0, y0, x1: x0 + 100, y1: y0 + 100 },
  cls: "text_bubble",
  bubble: null,
  lines: [],
  orientation: { tilt: 0, consistency: 1, writingMode: "v", ambiguous: false, frame: { cx: 0, cy: 0, w: 1, h: 1, angle: 0 } },
  classification: policy === "keep" ? { layout: "text_free", kind: "sfx", policy } : { layout: "bubble", kind: "dialogue", policy },
  utterances: texts.map((text) => utterance(text)),
  clean: "flat",
});

describe("pageText", () => {
  it("numbers regions in manga reading order, letters split bubbles, and skips kept SFX and empty reads", () => {
    const text = pageText(4, [
      region(0, 0, ["左のセリフ"]),
      region(300, 0, ["右のセリフ", "続き"]),
      region(150, 400, ["ドン"], "keep"),
      region(0, 400, [""]),
    ], "rtl");
    expect(text.units).toEqual([
      { id: "1a", kind: "dialogue", source: "右のセリフ" },
      { id: "1b", kind: "dialogue", source: "続き" },
      { id: "2", kind: "dialogue", source: "左のセリフ" },
    ]);
    expect(text.refs["1b"]).toEqual({ regionIndex: 1, utteranceIndex: 1 });
    expect(text.lines.map((line) => line.id)).toEqual(["4.1.0", "4.1.1", "4.2.0"]);
  });
});

describe("isRetryableLlmError", () => {
  it("retries bad JSON, HTTP errors and timeouts, but not aborts", () => {
    expect(isRetryableLlmError(new SyntaxError("x"))).toBe(true);
    expect(isRetryableLlmError(new ChatHttpError(500, "x"))).toBe(true);
    expect(isRetryableLlmError(new DOMException("t", "TimeoutError"))).toBe(true);
    expect(isRetryableLlmError(new DOMException("a", "AbortError"))).toBe(false);
    expect(isRetryableLlmError(new TypeError("bug"))).toBe(false);
  });

  it("turns a transport failure into a retried unit instead of failing the page", async () => {
    let calls = 0;
    const result = await translatePage(
      { language: "ja", page: 1, units: [{ id: "1", kind: "dialogue", source: "行く" }], glossary: [], matchingTerms: [], history: [] },
      async () => {
        calls += 1;
        if (calls === 1) throw new ChatHttpError(503, "loading");
        return completion("{\"1\":\"走\"}");
      },
      1,
    );
    expect(result.targets).toEqual({ "1": "走" });
  });
});

const userJson = (messages: ChatMessage[]) => JSON.parse(messages.at(-1)!.content);

describe("buildGlossary", () => {
  it("extracts with evidence, fixes names and freezes a role table", async () => {
    const lines = [
      { id: "1.1.0", page: 1, text: "リンちゃん、おはよう", nameTag: false },
      { id: "2.1.0", page: 2, text: "リン、行くよ", nameTag: false },
    ];
    const result = await buildGlossary(lines, "ja", async (messages, schema) => {
      if ("entities" in (schema.properties as object)) {
        return completion(JSON.stringify({ entities: [{ src: "リン", kind: "person", gender: "f", evidence: [userJson(messages).lines[0].id] }] }));
      }
      return completion(JSON.stringify({ items: userJson(messages).items.map((item: { src: string }) => ({ src: item.src, tgt: item.src === "リン" ? "琳" : "琳酱", gender: "f", note_zh: "", drop: false })) }));
    }, "model-sha");
    expect(result.skippedChunks).toBe(0);
    expect(result.terms.find((term) => term.canonical === "リン")?.target).toBe("琳");
    expect(result.glossary.roleTable).toEqual([{ source: "リン", target: "琳" }]);
  });

  it("skips a chunk that fails twice instead of failing the volume", async () => {
    const result = await buildGlossary([{ id: "1.1.0", page: 1, text: "テスト", nameTag: false }], "ja", async () => completion("not json"), "m");
    expect(result.skippedChunks).toBe(1);
    expect(result.terms).toEqual([]);
  });
});

describe("translateVolume", () => {
  const rin: FixedTerm = {
    normKey: "リン",
    canonical: "リン",
    kind: "person",
    surfaces: ["リン"],
    votes: 2,
    occurrences: 3,
    firstPage: 1,
    genderVotes: { m: 0, f: 0, x: 0 },
    partOf: [],
    target: "琳",
    targetAliases: [],
    gender: "unknown",
    noteZh: "",
    origin: "auto",
    locked: false,
  };
  const pages = [1, 2, 3].map((page) => ({
    page,
    units: [{ id: "1", kind: "dialogue" as const, source: `リン、${page}ページ` }],
    lines: [],
    refs: {},
  }));

  const context = (complete: CompleteFn) => ({
    terms: [rin],
    roleTable: [{ source: "リン", target: "琳" }],
    glossarySha: "sha",
    language: "ja" as const,
    complete,
    modelSha: "m",
    historyBudget: 2000,
  });
  const echo: CompleteFn = async (messages) => completion(JSON.stringify({ "1": `琳，第${userJson(messages).page}页` }));

  it("feeds earlier pages as history, injects page terms and repairs names", async () => {
    const seen: ChatMessage[][] = [];
    const results = await translateVolume(pages, context(async (messages) => {
      seen.push(messages);
      const page = userJson(messages).page;
      const answer = page === 1 ? "琳，第1页" : page === 2 ? "リン，第2页" : "小林，第3页";
      return completion(JSON.stringify({ "1": answer }));
    }));
    expect(results.map((result) => result.targets["1"])).toEqual(["琳，第1页", "琳，第2页", "小林，第3页"]);
    expect(results[2]!.flags["1"]).toEqual(["TR_TERM_MISS"]);
    expect(userJson(seen[0]!).terms).toEqual([{ source: "リン", target: "琳" }]);
    const pageTwo = seen.find((messages) => userJson(messages).page === 2)!;
    expect(pageTwo.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  it("re-translates one page with the same history the volume run used, skipping pages without a result", async () => {
    const volume = await translateVolume(pages, context(echo));
    const requests: ChatMessage[][] = [];
    const record: CompleteFn = async (messages, ...rest) => {
      requests.push(messages);
      return echo(messages, ...rest);
    };
    const again = await translateVolumePage(pages, 2, volume.slice(0, 2), context(record));
    expect(again).toEqual(volume[2]!);
    expect(requests[0]!.filter((message) => message.role === "assistant")).toHaveLength(2);

    requests.length = 0;
    await translateVolumePage(pages, 2, [volume[0]!, null], context(record));
    expect(requests[0]!.filter((message) => message.role === "assistant")).toHaveLength(1);
  });
});
