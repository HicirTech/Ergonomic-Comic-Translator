import { ChatHttpError } from "./chat-http-error.ts";
import type { ChatRequest, ChatResult } from "./interfaces/index.ts";
import { readSseData } from "./sse.ts";
import { createTokenRateMeter } from "./token-rate.ts";

interface StreamChunk {
  choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  timings?: { cache_n?: number; predicted_per_second?: number };
}

/**
 * OpenAI-compatible streaming client for llama-server with the sampling every translation request uses:
 * temperature 0 with a seed derived from the cache key, all penalties neutral (presence_penalty 1.5 would
 * suppress repeated moans and sound effects, which reads as sanitising), reasoning disabled in the request
 * as well, and grammar-constrained JSON. Streaming lets the governor watch generation speed (tg_3s).
 */
export const createChatClient = (baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch) => ({
  complete: async (
    request: ChatRequest,
    options: { timeoutMs: number; signal?: AbortSignal; onTokenRate?: (atMs: number, tokensPerSecond: number) => void },
  ): Promise<ChatResult> => {
    const started = performance.now();
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]) : AbortSignal.timeout(options.timeoutMs);
    const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        messages: request.messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0,
        seed: request.seed,
        presence_penalty: 0,
        frequency_penalty: 0,
        repeat_penalty: 1,
        max_tokens: request.maxTokens,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: "json_schema", json_schema: { name: "output", strict: true, schema: request.schema } },
        cache_prompt: true,
      }),
    });
    if (!response.ok || !response.body) {
      throw new ChatHttpError(response.status, await response.text());
    }

    const meter = options.onTokenRate ? createTokenRateMeter(options.onTokenRate) : null;
    let content = "";
    let reasoningContent = "";
    let finishReason: string | null = null;
    const result = { promptTokens: 0, cachedTokens: 0, completionTokens: 0, generationTokensPerSecond: null as number | null };
    for await (const data of readSseData(response.body)) {
      if (data === "[DONE]") break;
      const chunk = JSON.parse(data) as StreamChunk;
      const choice = chunk.choices?.[0];
      const piece = choice?.delta?.content ?? "";
      const thought = choice?.delta?.reasoning_content ?? "";
      if (piece || thought) meter?.(performance.now());
      content += piece;
      reasoningContent += thought;
      finishReason = choice?.finish_reason ?? finishReason;
      if (chunk.usage) {
        result.promptTokens = chunk.usage.prompt_tokens ?? result.promptTokens;
        result.completionTokens = chunk.usage.completion_tokens ?? result.completionTokens;
        result.cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? result.cachedTokens;
      }
      if (chunk.timings) {
        result.cachedTokens = chunk.timings.cache_n ?? result.cachedTokens;
        result.generationTokensPerSecond = chunk.timings.predicted_per_second ?? result.generationTokensPerSecond;
      }
    }
    return { content, reasoningContent, finishReason, ...result, elapsedMs: performance.now() - started };
  },
});

export type ChatClient = ReturnType<typeof createChatClient>;
