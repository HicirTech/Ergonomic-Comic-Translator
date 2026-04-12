# Ergonomic Comic Translator

**AI-assisted comic translation that empowers human translators — not replaces them.**

An end-to-end pipeline for OCR, text removal, and translation of comic pages and PDFs. Powered by [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), local inpainting models, and LLM-driven translation — all running locally, no Docker or cloud services required.

> **[中文版](README.zh.md)**

---

## Why "Ergonomic"?

Fully automated comic translation often produces results that miss context, tone, and cultural nuance. This project takes a different approach: **AI handles the tedious work (OCR, text removal, draft translations) while the human translator retains full control** over the final output.

Every step is reviewable and editable in the web UI:
- OCR polygons can be adjusted, split, merged, or redrawn
- Translations can be edited line-by-line with the original text side-by-side
- Text removal can be re-run per page with different settings
- The full undo/redo history is preserved per page

The goal is to make comic translation **faster without sacrificing quality**.

---

## Features

### OCR — Text Extraction

Extract text from comic pages with accurate polygon detection. Supports two models:

- **PaddleOCR-VL 1.5** (default) — vision-language model, best accuracy
- **Standard PaddleOCR** — faster, configurable language

Multi-GPU parallel processing is supported. PDF files are automatically split into pages.

→ [CLI usage](docs/cli-commands.md#ocr) · [API endpoints](docs/api-reference.md) · [Configuration](docs/setup.md#configuration)

### Text Removal — Clean Pages

Remove detected text from pages using local inpainting (lama_large model). Each page produces a clean "textless" version using the OCR bounding polygons as masks.

→ [CLI usage](docs/cli-commands.md#text-removal) · [API endpoints](docs/api-reference.md)

### Translation — LLM-Powered Drafts

Translate extracted text page-by-page using a local [Ollama](https://ollama.com) model. Each page call receives full OCR context and a sliding window of recently translated pages for cross-page consistency.

If whole-page translation fails after retries, the engine falls back to per-line translation automatically.

→ [CLI usage](docs/cli-commands.md#translation) · [API endpoints](docs/api-reference.md)

### Web UI — Visual Editor

A React + Material UI interface for the full workflow:

| Feature | Description |
|---------|-------------|
| **Gallery** | Upload cards with cover thumbnails and page counts |
| **Upload** | Drag-and-drop images, PDFs, or ZIPs with reorderable file lists |
| **OCR Editor** | Interactive SVG polygon editor — drag vertices, add/remove points, move polygons |
| **Text Editing** | Per-line text editor with vertical/horizontal orientation toggle |
| **Translation Editor** | Side-by-side original and translated text editing |
| **Translation Overlay** | Rendered translated text inside polygons, orientation-aware with auto-fitted font size |
| **Polygon Text Layout** | Scanline-based text wrapping that conforms to irregular polygon shapes — CJK characters stack in right-to-left columns for vertical orientation, non-CJK text uses word-boundary wrapping with rotated rendering |
| **Polygon Merging** | Select multiple polygons (Ctrl+click) and merge them into one — preview dialog with drag-and-drop to reorder text before confirming |
| **Snap to Bubble** | Right-click a polygon to auto-detect the surrounding speech bubble boundary using flood-fill edge detection, then snap the polygon to fit the bubble interior |
| **Rectify to Rectangle** | Right-click a polygon to convert any irregular shape to its axis-aligned bounding rectangle |
| **Text/Textless Toggle** | Switch between original and text-removed image |
| **Polygon Styling** | ARGB color picker for polygon overlay background |
| **Line Summary** | Status-colored indicators (normal / long / short / critical-short) |
| **Cross-page Problems** | Navigate OCR issues across all pages |
| **Context Menu** | Right-click to add/delete lines, snap to bubble, rectify to rectangle, merge selected, trigger OCR/textless/translation per page |
| **Undo / Redo** | Per-page history with snapshot persistence |
| **PDF Export** | WYSIWYG export of all pages with current overlay settings |
| **Keyboard Shortcuts** | Ctrl+S, Ctrl+Z, PageUp/PageDown, Delete |

→ [Component architecture](docs/frontend-components.md)

### CLI Tools

All pipeline operations are available as CLI commands:

```bash
bun run ocr              # run OCR
bun run textless <scope>  # remove text
bun run translate <scope> # translate
bun run delete <uploadId> # delete all data for an upload
bun run doctor            # system diagnostics
```

→ [Full CLI reference](docs/cli-commands.md)

### REST API

Upload-based workflow via HTTP endpoints. Supports image, PDF, and ZIP uploads with queue-based processing for OCR, text removal, and translation.

```bash
bun run api  # start API server on http://0.0.0.0:3000
```

→ [Full API reference](docs/api-reference.md)

---

## Quick Start

### Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA GPU with CUDA | NVIDIA GPU, 8+ GB VRAM |
| RAM | 8 GB | 16 GB |
| Software | [Bun](https://bun.sh), Python 3.12, [Poetry](https://python-poetry.org) | — |

AMD GPUs are experimentally supported via [ZLUDA](https://github.com/vosen/ZLUDA). WSL2 users get CUDA passthrough from Windows automatically.

### Setup

```bash
bun install                    # 1. Install Bun dependencies
bun run system:bootstrap       # 2. Install Poetry + pyenv via Homebrew
bun run python:bootstrap       # 3. Install Python 3.12 + PaddleOCR
bun run text-cleaner:bootstrap # 4. (Optional) Install text removal models
bun run doctor                 # 5. Verify everything
```

→ [Detailed setup guide](docs/setup.md)

---

## Architecture

Four layers working together:

| Layer | Technology | Role |
|-------|-----------|------|
| **System** | WSL2/Linux, Homebrew, NVIDIA/AMD GPU | Hardware and OS foundation |
| **Python** | Poetry + pyenv, PaddleOCR, PyTorch | OCR engine, text removal, PDF rendering |
| **Bun** | TypeScript, Bun runtime | API server, queue management, orchestration |
| **Frontend** | React 18, Material UI, Vite | Web UI for review and editing |

→ [Architecture overview](docs/architecture.md) · [Architecture diagram](docs/architecture.drawio) · [Python layer details](docs/python-layer.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Overview](docs/architecture.md) | System layers, data flow, and React context design |
| [Setup Guide](docs/setup.md) | Installation, bootstrap, and configuration reference |
| [Python Layer](docs/python-layer.md) | Python packages and Bun–Python communication protocol |
| [Frontend Components](docs/frontend-components.md) | Component architecture and context mapping |
| [API Reference](docs/api-reference.md) | REST API endpoints, parameters, and responses |
| [CLI Commands](docs/cli-commands.md) | All CLI commands and usage examples |
| [Architecture Diagram](docs/architecture.drawio) | Visual diagram (open with draw.io) |

> All documentation is also available in Chinese — see [中文文档](README.zh.md#文档).

---

## Configuration

All environment variables are resolved in `src/config.ts` with sensible defaults. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `COMIC_TRANSLATOR_TEMP_DIR` | `.tmp` | Root temp directory |
| `COMIC_TRANSLATOR_FILES_DIR` | `.tmp/ocr` | CLI OCR input directory |
| `OCR_MODEL` | `paddleocr-vl-1.5` | OCR model (`paddleocr` or `paddleocr-vl-1.5`) |
| `OCR_CONCURRENCY` | `1` | Parallel GPU batches (requires multiple GPUs) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_TRANSLATE_MODEL` | `translategemma:12b` | Translation model |
| `TRANSLATE_TARGET_LANGUAGE` | `Chinese` | Default target language |

→ [Full configuration reference](docs/setup.md#configuration)

---

## License

MIT — see [LICENSE](LICENSE).
