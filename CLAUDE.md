# Ergonomic Comic Translator v2: rules for coding agents

This file binds every coding agent, script and spike that works in this repository.

## Product in one paragraph

Drop in a comic volume (zip, cbz, folder or images) and get a readable Simplified Chinese volume back:
in-app reader, image pack (CBZ/ZIP) or PDF. Everything runs locally. Users cannot read the source
language and will not edit art, so the pipeline is fully automatic and checks itself.

## Stack

- Bun + TypeScript only. No Python, Docker, WSL or CUDA toolkit in the product.
- Vision inference: `onnxruntime-node` (cpu, dml, webgpu) in child processes, never in the main process.
- Images: `sharp` (static import; a dynamic `import()` of sharp fails under Bun), text layout: harfbuzzjs +
  resvg-js, zip: fflate, PDF: pdf-lib.
- LLM: official llama.cpp `llama-server` pinned in `runtimes.lock.json`; Ollama is an optional adapter only.
- Storage: `bun:sqlite` (WAL) in the data directory, which must be on a local disk.

## G0: GPU and memory safety protocol (mandatory)

The owner's GPU and RAM are shared with other applications. On 2026-09-29 two concurrent model loads by
agents overflowed VRAM into RAM and crashed the machine. Therefore:

1. Consent: models up to 10 GB may be loaded only from a list the owner approved for the current session
   (model, expected VRAM, duration). Anything larger needs a separate approval each time, with the GPU idle.
   An agent can never approve itself. "Download" never implies "run".
2. Pre-check: before any load, run the governor admission (`src/gov`) for VRAM, RAM and commit headroom.
   Mark the run FREE only when external GPU utilisation is below 30 %, otherwise SHARED.
3. Hold `run/gpu.lock` in the data directory for every model process; one model process at a time.
   Start small; disable reasoning and cap `max_tokens` on every LLM request; keep the watchdog running.
4. At most 10 minutes of GPU time per item and 45 minutes per day during development.
5. Append every result to JSONL immediately; never collect results only at the end.
6. When done, stop only the processes you started (by PID) and confirm VRAM is back to baseline
   within 300 MiB and RAM has recovered.
7. Never use the owner's shared Ollama daemon (port 11434). If Ollama is unavoidable, start a private
   instance on another port with `OLLAMA_MAX_LOADED_MODELS=1` and check `presence_penalty` in its log.

Sub-agents are told explicitly that they must not load models or use the GPU unless the owner approved it
for that agent.

## Content and data rules

- Benchmark volumes, their pages and anything derived from them (OCR text, translations, crops, masks)
  never enter the repository. Evaluation data lives outside it (`COMIC_TRANSLATOR_BENCH_DIR`).
- Regression and benchmark data contain adult characters only.
- Logs, terminal output and reports never contain source or target text; they carry ids and metrics.
- The server binds to 127.0.0.1 only.

## Licences

- This project is MIT.
- GPL/AGPL projects are design references only; never copy their code: manga-image-translator,
  BallonsTranslator, comic-text-detector, GalTransl, AiNiee, ultralytics.
- MIT/Apache-2.0 code (koharu, comic-translate) may be ported with attribution in the file header.
- Default model pack: Apache-2.0 or MIT weights only, each pinned by revision and sha256 in
  `models.lock.json` together with its licence.

## Working rules

- Match the surrounding code: 2-space indent, double quotes, semicolons, `.ts` import extensions,
  `export const` arrow functions, one exported type per file under `interfaces/` with an `index.ts` barrel.
- Pure logic lives in plain functions with `bun test` coverage under `tests/`; hardware and model code
  stays thin around it.
- Run `bun test` and `bun run typecheck` before every commit.
