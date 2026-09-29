import { afterAll, describe, expect, it } from "bun:test";
import { createChatClient } from "../../src/llm/chat-client.ts";
import { ChatHttpError } from "../../src/llm/chat-http-error.ts";
import { buildLlamaServerArgs } from "../../src/llm/llama-server-args.ts";
import { readSseData } from "../../src/llm/sse.ts";
import { createTokenRateMeter } from "../../src/llm/token-rate.ts";

const options = {
  executable: "llama-server.exe",
  modelPath: "C:/models/qwen.gguf",
  device: "Vulkan0",
  contextPerSlot: 8192,
  parallel: 1,
  threads: 4,
  port: 41234,
  apiKey: "k",
  chatTemplateFile: null,
};

const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

describe("llama-server launch template", () => {
  it("disables fit, mmap and reasoning, sizes the context explicitly and binds to loopback", () => {
    const args = buildLlamaServerArgs(options);
    expect(flag(args, "--fit")).toBe("off");
    expect(flag(args, "--load-mode")).toBe("none");
    expect(flag(args, "--reasoning")).toBe("off");
    expect(flag(args, "--reasoning-budget")).toBe("0");
    expect(flag(args, "-c")).toBe("8192");
    expect(flag(args, "-ngl")).toBe("all");
    expect(flag(args, "--host")).toBe("127.0.0.1");
    expect(flag(args, "--cache-ram")).toBe("256");
    expect(args).not.toContain("--kv-unified");
    expect(args).not.toContain("--context-shift");
  });

  it("scales the context with parallel slots and uses no GPU layers on the CPU", () => {
    const args = buildLlamaServerArgs({ ...options, parallel: 2, device: "none", chatTemplateFile: "C:/t.jinja" });
    expect(flag(args, "-c")).toBe("16384");
    expect(args).toContain("--kv-unified");
    expect(flag(args, "-ngl")).toBe("0");
    expect(flag(args, "--chat-template-file")).toBe("C:/t.jinja");
  });
});

describe("readSseData", () => {
  it("reassembles events split across chunks and CRLF lines", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of ["data: {\"a\"", ":1}\r\n\r\n: comment\n", "data: [DONE]\n\n"]) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    });
    const events: string[] = [];
    for await (const event of readSseData(stream)) events.push(event);
    expect(events).toEqual(["{\"a\":1}", "[DONE]"]);
  });
});

describe("createTokenRateMeter", () => {
  it("reports tokens per second over the last 3 s, at most once a second", () => {
    const reports: [number, number][] = [];
    const tick = createTokenRateMeter((atMs, rate) => reports.push([atMs, rate]));
    for (let ms = 0; ms <= 5000; ms += 20) tick(ms);
    expect(reports.length).toBe(5);
    expect(reports.at(-1)![1]).toBeCloseTo(50, 0);
  });
});

const requests: Record<string, unknown>[] = [];
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    if (request.headers.get("authorization") !== "Bearer secret") return new Response("no", { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    requests.push(body);
    const chunks = [
      { choices: [{ delta: { content: "{\"1\":" } }] },
      { choices: [{ delta: { content: "\"你好\"}" }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 120, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 100 } }, timings: { cache_n: 100, predicted_per_second: 80 } },
    ];
    const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(text, { headers: { "content-type": "text/event-stream" } });
  },
});
afterAll(() => server.stop(true));

describe("createChatClient", () => {
  const client = createChatClient(`http://127.0.0.1:${server.port}`, "secret");

  it("sends neutral sampling, disabled reasoning and a strict schema, and assembles the stream", async () => {
    const result = await client.complete({ messages: [{ role: "user", content: "x" }], schema: { type: "object" }, maxTokens: 104, seed: 7 }, { timeoutMs: 5000 });
    expect(result).toMatchObject({ content: "{\"1\":\"你好\"}", reasoningContent: "", finishReason: "stop", promptTokens: 120, cachedTokens: 100, completionTokens: 9, generationTokensPerSecond: 80 });
    expect(requests.at(-1)).toMatchObject({
      stream: true,
      temperature: 0,
      seed: 7,
      presence_penalty: 0,
      frequency_penalty: 0,
      repeat_penalty: 1,
      max_tokens: 104,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema", json_schema: { strict: true, schema: { type: "object" } } },
    });
  });

  it("raises ChatHttpError on a non-2xx answer", async () => {
    const wrongKey = createChatClient(`http://127.0.0.1:${server.port}`, "wrong");
    await expect(wrongKey.complete({ messages: [], schema: {}, maxTokens: 1, seed: 0 }, { timeoutMs: 5000 })).rejects.toBeInstanceOf(ChatHttpError);
  });
});
