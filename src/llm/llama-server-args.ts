import type { LlamaServerOptions } from "./interfaces/index.ts";

/** Host RAM for llama-server's prompt cache; its default of 8 GiB is too much next to other apps. */
const promptCacheMib = 256;
/** Context checkpoints per slot (default 32, about 63 MiB each, all in host RAM). */
const contextCheckpoints = 2;

/**
 * The fixed launch template (flags verified against llama.cpp b11146 common/arg.cpp):
 * - `--fit off`: its fit logic only sees this process's free memory under WDDM; the governor decides;
 * - `--load-mode none`: no mmap; in the 2026-09-29 incident an mmapped 20 GiB file squeezed RAM;
 * - explicit `-c`: the default would take the model maximum (262144 for Qwen3.5);
 * - reasoning off twice (`--reasoning off`, budget 0) — requests also send enable_thinking false;
 * - no context shift, no idle sleep, no web UI; bound to 127.0.0.1 with a random API key.
 */
export const buildLlamaServerArgs = (options: LlamaServerOptions) => {
  const args = [
    "-m", options.modelPath,
    "--device", options.device,
    "--fit", "off",
    "-ngl", options.device === "none" ? "0" : "all",
    "-c", String(options.contextPerSlot * options.parallel),
    "-np", String(options.parallel),
    "-fa", "auto",
    "--load-mode", "none",
    "--cache-ram", String(promptCacheMib),
    "--ctx-checkpoints", String(contextCheckpoints),
    "--reasoning", "off",
    "--reasoning-budget", "0",
    "-t", String(options.threads),
    "--metrics",
    "--no-ui",
    "--host", "127.0.0.1",
    "--port", String(options.port),
    "--api-key", options.apiKey,
  ];
  if (options.parallel > 1) {
    args.push("--kv-unified");
  }
  if (options.chatTemplateFile) {
    args.push("--jinja", "--chat-template-file", options.chatTemplateFile);
  }
  return args;
};
