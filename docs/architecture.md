# Architecture Overview

> [中文版](architecture.zh.md)

This document describes the high-level architecture of **Ergonomic Comic Translator** — a Bun-driven OCR, text removal, and translation pipeline for comic page images and PDFs.

## Layer Diagram

See [architecture.drawio](architecture.drawio) for a visual diagram (open with [draw.io](https://app.diagrams.net/)).

## System Layers

### 1. Frontend (React 18 + MUI)

Single-page app served by Vite. Two pages:

- **HomePage** — gallery of uploads as portrait cards with cover images and page counts.
- **UploadDetailPage** — image strip sidebar for page navigation + OcrPreviewPanel editor.

The OcrPreviewPanel is the most complex component. It uses **4 focused React Contexts** to minimize unnecessary re-renders:

| Context | Purpose | Changes when |
|---------|---------|--------------|
| `OcrLinesContext` | Line data + selection state | Every click / text edit |
| `OcrViewContext` | Visual settings + refs | Toolbar toggle (rare) |
| `OcrTranslationContext` | Translation data | Translation edit |
| `OcrActionsContext` | Save state, polygon interactions, page actions | Save / right-click / drag |

Sub-components only subscribe to the contexts they need:
- `ImageToolbar` → View only
- `LineSummaryPanel` → Lines only
- `TranslationEditor` → Lines + Translation
- `LineEditor` → Lines + Actions
- `SvgOverlay` → All four (it renders everything)
- `EditorContextMenu` → Lines + Actions

### 2. API Server (Bun HTTP)

REST API with queue-based processing:

- **Routes**: upload, ocr, textless, translate, context
- **Services**: factory functions with dependency injection (no classes)
- **Repositories**: async interfaces with file-backed implementations (seam for future DB migration)
- **Queue pattern**: `Ready → Queued → Processing → Completed` state machine, shared via `createQueueProcessor<T>()` generic factory

### 3. OCR Module

High-level TypeScript orchestration for the OCR pipeline:

1. **Preparation** — Discovers input files, splits PDFs into per-page PNGs
2. **Execution** — Spawns PaddleOCR via Python in batches (multi-GPU support)
3. **Merge** — Deterministically merges batch results into a single output JSON

### 4. CLI Scripts

Thin wrappers that import logic from service modules:

| Command | Script | Description |
|---------|--------|-------------|
| `bun run ocr` | `main.ts` | Run OCR pipeline |
| `bun run textless` | `scripts/textless.ts` | Text removal |
| `bun run translate` | `scripts/translate.ts` | Translation via Ollama |
| `bun run delete` | `scripts/delete.ts` | Permanent upload deletion |
| `bun run context` | `scripts/context.ts` | Detect glossary terms from OCR text |

### 5. Python Layer

Two domain packages under `src/python/`, invoked as modules with `PYTHONPATH=src/python/`:

| Package | Venv | Entry point | Purpose |
|---------|------|-------------|---------|
| `ocr/` | Poetry | `python -m ocr.runner` | PaddleOCR / PaddleOCR-VL batch processing |
| `textless/` | text-cleaner-venv | `python -m textless.runner` | Inpainting-based text removal |
| `memory/` | memory-venv | `python -m memory.cli` | Persistent translation memory (Mem0 + Qdrant) |

Communication with Bun uses a two-channel protocol:
- **stderr** → logging (`[INFO]`, `[WARN]`, `[ERROR]` prefixes), forwarded to log4js
- **stdout** → structured JSON result data

### 6. Setup & Diagnostics

Bootstrap scripts install dependencies in layers:

1. `system:bootstrap` — Homebrew, Poetry, pyenv
2. `python:bootstrap` — Python 3.12, Poetry venv, PaddleOCR wheels
3. `text-cleaner:bootstrap` — Separate venv with PyTorch + inpainting models
4. `memory:bootstrap` — Separate venv with Mem0 + Qdrant (optional)

Detection scripts probe hardware and software:
- `doctor` — Full system check
- `nvidia:detect`, `cuda:detect`, `amd:detect` — GPU capabilities
- `python:detect`, `system:detect` — Software versions

## Data Flow

```
Upload → OCR Prepare → OCR Execute → Merge → Textless → Context → Translate
  ↓          ↓              ↓           ↓         ↓          ↓         ↓
upload/   ocr_prepare/   (batches)   ocr_output/ textless/ context/ translated/
```

All data stored under `.tmp/` (configurable via env vars). Each upload gets a UUID scope; CLI uses `ocr` as the scope.
