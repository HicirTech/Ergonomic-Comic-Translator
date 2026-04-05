# comictranslator

To install dependencies:

```bash
bun install
```

This project creates a local `.venv` on first run and installs PaddlePaddle plus PaddleOCR into that isolated environment, so it does not modify your global Python packages. You still need a normal Python installation on the machine so Bun can bootstrap the virtual environment:

No manual `pip install` is required. The app will create `.venv` and install the OCR dependencies there automatically on first run.

If Python is not on PATH, set `OCR_PYTHON_PATH` to the local Python executable you want Bun to use.

On Windows, `py -3` is supported as a bootstrap command if `python` is not on PATH.

To run:

```bash
bun run ocr
```

The first run will create `.venv`, install the OCR dependencies there, then process all images under `comics/` and write `output/ocr-results.json`.

Source code lives in `src/`, and `context.txt` at the project root is reserved for AI notes and working context.

This project was created using `bun init` in bun v1.3.7. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
