# Python Layer

> [中文版](python-layer.zh.md)

The Python code lives in `src/python/` and is organized as two domain packages. Both are invoked as modules (`python -m`) with `PYTHONPATH=src/python/`.

## Package Structure

```
src/python/
├── ocr/                       ← OCR package (Poetry venv)
│   ├── __init__.py
│   ├── runner.py              ← PaddleOCR / PaddleOCR-VL batch runner
│   ├── pdf.py                 ← PDF to PNG renderer
│   └── geometry.py            ← polygon/box geometry helpers
├── textless/                  ← Text removal package (text-cleaner-venv)
│   ├── __init__.py
│   ├── runner.py              ← Text removal entry point
│   ├── config.py              ← Configuration parsing
│   ├── inpainting/            ← Inpainting strategy dispatch
│   │   ├── __init__.py
│   │   ├── base.py            ← Abstract inpainter interface
│   │   ├── lama.py            ← lama_large implementation
│   │   ├── none.py            ← No-op inpainter
│   │   └── original.py       ← Original image passthrough
│   └── utils/                 ← Shared utilities
│       ├── __init__.py
│       ├── generic.py         ← Generic helpers
│       ├── inference.py       ← Model inference utilities
│       ├── log.py             ← Logging ([INFO]/[WARN]/[ERROR] to stderr)
│       └── threading.py       ← Thread pool management
└── models/                    ← Model weights (gitignored, downloaded by bootstrapper)
```

## Invocation

TypeScript invokes Python via `src/scripts/python-run.ts`:

```typescript
// OCR (Poetry venv)
poetry run python -m ocr.runner --input ... --output ...

// PDF splitting (Poetry venv)
poetry run python -m ocr.pdf --input ... --output ...

// Text removal (text-cleaner-venv)
.tmp/text-cleaner-venv/bin/python -m textless.runner --input ... --ocr-json ... --output ...
```

The `PYTHONPATH` environment variable is always set to `src/python/` so Python resolves the package imports correctly.

## Communication Protocol

| Channel | Purpose | Format |
|---------|---------|--------|
| **stderr** | Logging | `[INFO]`, `[WARN]`, `[ERROR]` prefixed lines |
| **stdout** | Data | Structured JSON or unused (when writing to `--output` file) |

- stderr is streamed line-by-line and forwarded to log4js via `forwardPythonLine()`
- stdout is drained fully and returned as a string
- Both streams are consumed concurrently with `Promise.all` to prevent pipe-buffer deadlocks

### Output Methods

| Module | stdout | Data output |
|--------|--------|-------------|
| `ocr.runner` | unused | Writes JSON to `--output` file |
| `ocr.pdf` | unused | Writes JSON manifest to `--output` file |
| `textless.runner` | last line = JSON | `{success, outputPath}` or `{success, error}` |

## Progress Reporting

OCR progress is extracted from stderr via regex `[INFO] Processing page N/M` and triggers an `onProgress(current, total)` callback in TypeScript.

## Error Handling

- Non-zero exit codes throw `Error("{prefix} failed with exit code {code}")`
- `sys.exit(2)` — missing dependencies
- `sys.exit(1)` — input errors

## Coding Conventions

- Use relative imports within packages (`from .geometry import ...`)
- Keep logging via `utils/log.py` (outputs to stderr with prefix tags)
- All model inference should use the utilities in `utils/inference.py`
- Never invoke Python scripts as standalone files — always use `python -m module.name`
