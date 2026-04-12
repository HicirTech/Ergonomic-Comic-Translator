#!/usr/bin/env python3
"""
PDF page splitter — renders each page of a PDF into a PNG image
for downstream OCR processing.

Usage:
  python -m ocr.pdf \
    --input /path/to/file.pdf \
    --output /path/to/manifest.json \
    --image-dir /path/to/images/ \
    [--prefix page] \
    [--scale 2.0]
"""
import argparse
import json
import os
import sys
from typing import Any

try:
    import pypdfium2 as pdfium
except ImportError as error:
    print(f"[ERROR] Missing Python dependency: {error}. Run `bun run python:bootstrap` first.", file=sys.stderr)
    sys.exit(2)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Render PDF pages into images for Bun-managed OCR concurrency.")
    parser.add_argument("--input", required=True, help="Path to the input PDF file.")
    parser.add_argument("--output", required=True, help="Path to the output JSON manifest.")
    parser.add_argument("--image-dir", required=True, help="Directory where rendered page images will be written.")
    parser.add_argument("--prefix", default="page", help="Filename prefix for rendered page images.")
    parser.add_argument("--scale", type=float, default=2.0, help="PDF render scale factor.")
    return parser.parse_args()


def render_pdf_pages(
    input_path: str,
    image_dir: str,
    scale: float,
    prefix: str = "page",
) -> dict[str, Any]:
    """
    Render all pages of a PDF into individual PNG images.

    Returns a manifest dict with source path, page count, and per-page metadata
    including the absolute path to each rendered image.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"PDF does not exist: {input_path}")

    os.makedirs(image_dir, exist_ok=True)
    document = pdfium.PdfDocument(input_path)
    page_count = len(document)
    pages: list[dict[str, Any]] = []

    for page_index in range(page_count):
        page = document[page_index]
        output_path = os.path.join(image_dir, f"{prefix}-{page_index + 1:04d}.png")
        bitmap = page.render(scale=scale)
        bitmap.to_pil().save(output_path)
        page.close()

        pages.append(
            {
                "pageIndex": page_index,
                "pageNumber": page_index + 1,
                "pageCount": page_count,
                "imagePath": os.path.abspath(output_path),
            }
        )

    document.close()
    return {
        "sourcePath": os.path.abspath(input_path),
        "pageCount": page_count,
        "pages": pages,
    }


def main() -> None:
    """Entry point: parse args, render PDF, write JSON manifest."""
    args = parse_args()
    manifest = render_pdf_pages(args.input, args.image_dir, args.scale, args.prefix)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
