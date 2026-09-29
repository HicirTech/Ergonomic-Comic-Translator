/** llama-server answered a completion request with a non-2xx status. */
export class ChatHttpError extends Error {
  readonly code = "LLM_HTTP";
  constructor(readonly status: number, body: string) {
    super(`llama-server answered HTTP ${status}: ${body.slice(0, 200)}`);
  }
}
