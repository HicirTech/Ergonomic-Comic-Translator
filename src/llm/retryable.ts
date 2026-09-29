import { ChatHttpError } from "./chat-http-error.ts";

/**
 * Failures a retry can fix: an answer that is not valid JSON, an HTTP error from llama-server, or the
 * per-request timeout. An abort (red light, cancelled job) and programming errors are not retryable.
 */
export const isRetryableLlmError = (error: unknown) =>
  error instanceof SyntaxError
  || error instanceof ChatHttpError
  || (error instanceof DOMException && error.name === "TimeoutError");
