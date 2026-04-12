# CLI Commands

> [中文版](cli-commands.zh.md)

All CLI commands are defined in `package.json` and implemented as thin wrappers in `src/scripts/`.

## Pipeline Commands

| Command | Description |
|---------|-------------|
| `bun run ocr` | Run OCR on images/PDFs in the input directory |
| `bun run textless <scope> [page]` | Remove text from processed pages |
| `bun run translate <scope> [page] [--lang <language>]` | Translate extracted text via Ollama |
| `bun run delete <uploadId>` | Permanently delete all data for an upload |
| `bun run context <scope>` | Dump context information |

## Server Commands

| Command | Description |
|---------|-------------|
| `bun run api` | Start the API server (default: `http://0.0.0.0:3000`) |
| `bun run dev:frontend` | Start Vite dev server for web UI |
| `bun run build:frontend` | Production build to `dist/frontend/` |
| `bun run preview:frontend` | Serve production build |

## Setup Commands

| Command | Description |
|---------|-------------|
| `bun run system:bootstrap` | Install Poetry + pyenv via Homebrew |
| `bun run python:bootstrap` | Install Python 3.12 + Poetry venv + PaddleOCR |
| `bun run text-cleaner:bootstrap` | Create text-cleaner venv with PyTorch + models |

## Diagnostic Commands

| Command | Description |
|---------|-------------|
| `bun run doctor` | Full system health check |
| `bun run system:detect` | System layer info |
| `bun run nvidia:detect` | NVIDIA GPU info |
| `bun run cuda:detect` | CUDA capabilities |
| `bun run amd:detect` | AMD GPU info |
| `bun run python:detect` | Python environment info |

## Examples

```bash
# OCR with default VL model
bun run ocr

# OCR with standard PaddleOCR
OCR_MODEL=paddleocr OCR_LANGUAGE=japan bun run ocr

# Multi-GPU parallel processing
OCR_CONCURRENCY=2 bun run ocr

# Text removal
bun run textless ocr            # all pages
bun run textless ocr 3          # page 3 only
bun run textless abc-123-...    # API upload

# Translation
bun run translate ocr                        # all pages
bun run translate ocr 5                      # page 5 only
bun run translate ocr --lang Japanese        # to Japanese
bun run translate abc-123-...                # API upload

# Delete
bun run delete abc-123-...
```

## Scope

CLI commands use `ocr` as the default scope. API uploads use the upload UUID as the scope. The scope determines the subdirectory paths under `.tmp/` for all pipeline outputs.
