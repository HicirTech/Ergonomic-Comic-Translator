# Ergonomic Comic Translator

Drop in a comic volume and get it back in Simplified Chinese: read it in the built-in web reader or download it
as CBZ or PDF. Everything runs on your own computer with local models; no cloud service, no account, no Python.
You do not need to know the source language or edit any artwork: reading, cleaning, translating, lettering and
checking are automatic.

> **[中文版](README.zh.md)**

> **Status: v2 is under development (branch `v2`).** The whole pipeline, the job runner, the local server and the
> web UI are implemented and covered by unit tests, but no volume has been run end to end with the real models
> yet. Quality and speed are unmeasured until that benchmark run. See [Not done yet](#not-done-yet).

---

## What happens to a volume

1. **Import.** Zip or CBZ archives, whole folders and loose images (JPG, PNG, WebP, AVIF, GIF) become pages in
   natural order, chapter by chapter. Duplicate images are kept once; blank pages are kept as they are, every
   other page is read, and a page without text comes back unchanged. PDF input is not supported.
2. **Read** (ONNX Runtime, GPU or CPU). Text and bubble detection, text line geometry including slanted text,
   orientation, splitting one bubble into several speakers' lines, OCR, text masks and cleaning (flat fill for
   plain bubbles, LaMa inpainting on artwork). A wide dialogue box is read line by line when the sentence
   reader drops part of it.
3. **Names and terms first.** Names and recurring terms of the whole volume are collected, translated with
   context from across the volume, and frozen so every page uses the same Chinese names.
4. **Translate** (llama.cpp). Page by page in reading order, with earlier pages as rolling context. Every answer
   is checked automatically (structure, refusals, echoed source text, untranslated kana or hangul, repetition);
   failed lines are retried, and glossary names are enforced. A complete answer that is still doubtful after
   the retries (some kana left, a short text returned as it was, a much-repeated cry) is used and marked for
   review.
5. **Letter.** Chinese text is set horizontally or vertically in the original box at the original angle, with
   Chinese line-breaking rules, in Noto Sans SC Bold. It stays inside its bubble and the page, is at most a
   tenth larger than the text it replaces, uses light ink on dark boxes, and gets an outline unless the bubble
   is plain paper. A line without a usable translation shows "（这句没能翻译）" instead of an empty bubble.
6. **Export.** CBZ (PNG pages with `ComicInfo.xml`) and PDF (right to left for manga).

The source language (Japanese, Korean, Traditional Chinese or English) is detected from the recognised text,
and the reading direction follows from it.

## Requirements

| | |
|---|---|
| OS | Windows 10/11 x64. Linux x64 is experimental and runs on the CPU only. |
| Runtime | [Bun](https://bun.sh) 1.4 or newer |
| GPU | NVIDIA or AMD with DirectX 12 (reading, via DirectML) and Vulkan (translation, via llama.cpp). AMD integrated graphics (e.g. Radeon 780M) work with a UMA frame buffer of at least 2 GB. Intel GPUs are not supported; the CPU is used instead. |
| Video memory | About 7-10 GB free for the default translation models (estimates, not yet measured); smaller tiers exist for 8 GB cards and integrated graphics. |
| Disk | About 14 GB for the default downloads (vision 1.1 GB, translation models 12.2 GB, llama.cpp 50 MB), plus 8 GB for the small-GPU models. |

The app shares the GPU politely: it checks free video memory, RAM and commit before loading anything, pauses when
memory runs low (yellow light), unloads its models when it runs out (red light) and continues later. Only one
set of models is loaded at a time, guarded by a machine-wide lock that the command-line tools use too.

## Getting started

```bash
bun install
bun run models:fetch vision fonts llm   # add llm-small on 8 GB cards and integrated graphics
bun run runtimes:fetch                  # llama.cpp b11146 (Vulkan and CPU builds)
bun run build:frontend
bun run doctor                          # read-only report: GPUs, memory, recommended tier
bun run start                           # then open http://127.0.0.1:3000
```

Downloads are pinned by revision, size and sha256 in `models.lock.json` and `runtimes.lock.json` and verified
after download. Set `HF_ENDPOINT` to use a Hugging Face mirror.

In the web UI:

- Drop files or a folder (or use the buttons), check the one-line summary (pages, blank pages, skipped files),
  and start.
- The volume page shows progress, the current step and resource messages. The reader switches between the
  translated and the original page; in a right-to-left book the left arrow key turns to the next page.
- Download CBZ or PDF when the volume is done; stop or delete a volume at any time.

`bun run start` resumes unfinished jobs, which loads models. Options: `--port <n>` (default 3000) and `--cpu`
(vision on the CPU).

### Data directory

Everything the app downloads or produces lives in `%LOCALAPPDATA%\ComicTranslator` (Linux:
`$XDG_DATA_HOME/comic-translator`); set `COMIC_TRANSLATOR_HOME` to an absolute path to move it. It must be on a
local disk.

| Folder | Contents |
|---|---|
| `db/` | `ct.sqlite`: volumes, pages, jobs, tasks, QA flags |
| `pages/` | imported page images, named by their sha256 |
| `volumes/<id>/` | vision results, text, glossary, translations, rendered pages, exports |
| `models/`, `runtimes/` | locked model files and llama.cpp builds |
| `run/` | `gpu.lock` and its owner |
| `logs/` | llama-server logs |
| `cache/` | uploads while they are imported |
| `runs/` | output folders of `bun run vision` |

## Command-line tools

| Command | What it does |
|---|---|
| `bun run start [--port 3000] [--cpu]` | Local server with the web UI and the job runner |
| `bun run doctor [--seconds N] [--json]` | Read-only resource report; never loads a model |
| `bun run models:fetch [pack or model id ...]` | Download and verify models (packs: `vision`, `fonts`, `llm`, `llm-small`, `korean`; `--list` shows all) |
| `bun run runtimes:fetch [asset ...]` | Download and unpack llama.cpp (default: this platform's Vulkan and CPU builds) |
| `bun run vision <zip, cbz, folder or images> [--out dir] [--cpu] [--prior v\|h]` | Reading and cleaning only, into a run folder |
| `bun run translate <run folder> [--lang ja\|ko\|zh-Hant\|en] [--ltr] [--history 2000]` | Names, terms and translation of a vision run |
| `bun run render <run folder> [--ltr] [--title name]` | Lettering, CBZ and PDF for a translated run (CPU only) |
| `bun run gt:d1 <zip or folder> [--out dir]` | Evaluation: text-area ground truth from pages and their textless variants (CPU only) |

`vision`, `translate` and `start` (while a job runs) load models and take the GPU lock; the others do not.

## Architecture

| Process | Role |
|---|---|
| Main Bun process | HTTP server on 127.0.0.1, SQLite (single writer), job runner, resource governor, lettering and export |
| Two vision workers | ONNX Runtime in child processes: one on the GPU (DirectML), one on the CPU; a hung run is killed |
| `llama-server` | The one translation model, on a random local port with a random API key |

The GPU is time-shared: the reading models run first, then they are unloaded and the translation model is loaded.
Lettering and export run on the CPU alongside.

| Folder | Contents |
|---|---|
| `src/core` | paths, hashing, canonical JSON, cache keys, ids, small utilities |
| `src/gov`, `src/platform` | resource governor: DXGI, PDH and memory probes via `bun:ffi`, admission, lights, GPU lock |
| `src/models`, `src/ort`, `src/workers` | locked downloads, ONNX Runtime setup, worker processes |
| `src/stages` | ingest, page profile, detection, lines, regions, utterances, OCR, masks, cleaning, reading order, language |
| `src/pipeline` | page and volume pipelines built from the stages |
| `src/llm`, `src/translate`, `src/qa`, `src/terms` | llama-server client, translation contract, automatic checks, names and terms |
| `src/typeset`, `src/export` | lettering and CBZ/PDF export |
| `src/db`, `src/jobs`, `src/sessions`, `src/server` | storage, task planning and running, model sessions, HTTP API |
| `src/frontend` | React + MUI web UI ([components](docs/frontend-components.md)) |
| `eval`, `tests` | evaluation tools and unit tests |

## Not done yet

- A first end-to-end run on the benchmark volume, with speed and quality measurements.
- Korean: the Korean line recogniser is downloadable (`korean` pack) but the pipeline does not use it yet, so
  Korean pages are read by the Japanese-oriented readers.
- Fallback translation with other models when the main model keeps refusing or failing (only retries with the
  same model exist today).
- Re-running a volume recomputes every step; finished steps are not reused yet.
- The small-GPU translation tiers (8 GB cards, integrated graphics) are untested, and MI-GAN inpainting is
  downloaded but not used yet.
- A portable installer, a GPU self-check of the ONNX execution providers, and GPU support on Linux.

## Development

```bash
bun test
bun run typecheck
bun run typecheck:frontend
bun run dev:frontend   # Vite on port 5173, proxying /api to bun run start on port 3000
```

Rules for contributions:

- Bun and TypeScript only in the product: no Python, Docker, WSL or CUDA toolkit.
- Logs and terminal output carry ids and metrics, never source or target text.
- Benchmark volumes and anything derived from them (OCR text, translations, crops, masks) never enter the
  repository.
- Check resources (`bun run doctor`) before loading models, and load models only while holding the GPU lock.
- GPL and AGPL projects are design references only; the default model pack uses Apache-2.0, MIT or OFL
  licensed files only.

## Models

| Model | Licence | Role |
|---|---|---|
| [ogkalu/comic-text-and-bubble-detector](https://huggingface.co/ogkalu/comic-text-and-bubble-detector) | Apache-2.0 | text and bubble detection (RT-DETR-v2) |
| [PP-OCRv5 mobile det](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx) | Apache-2.0 | text line geometry |
| [PP-OCRv5 server rec](https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec_onnx) | Apache-2.0 | line recognition used to split bubbles |
| [PP-LCNet textline orientation](https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori_onnx) | Apache-2.0 | 0/180 degree line orientation |
| [Baberu OCR](https://huggingface.co/genshiai-daichi/baberu-ocr) | Apache-2.0 | main OCR (Japanese, Chinese, English) |
| [manga-ocr](https://huggingface.co/onnx-community/manga-ocr-base-ONNX) | Apache-2.0 | short Japanese text |
| [LaMa manga](https://huggingface.co/mayocream/lama-manga-onnx) | Apache-2.0 | inpainting |
| [MI-GAN](https://huggingface.co/andraniksargsyan/migan) | MIT | light inpainting for small GPUs (not used yet) |
| [Qwen3.5-9B GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF) | Apache-2.0 | translation (Q6_K, Q4_K_M, IQ3_XXS tiers) |
| [Hy-MT2-7B GGUF](https://huggingface.co/tencent/Hy-MT2-7B-GGUF) | Apache-2.0 | translation tier for integrated graphics |
| [Noto Sans SC Bold](https://github.com/notofonts/noto-cjk) | OFL-1.1 | Chinese lettering font |
| [korean PP-OCRv5 mobile rec](https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx) | Apache-2.0 | Korean line recognition (not used yet) |

## License

MIT, see [LICENSE](LICENSE). Model files keep their own licences listed above.
