#!/usr/bin/env python3
"""
PaddleOCR runner — executes OCR on a batch of image files and emits
structured JSON output with bounding-box geometry and line text.

Supports two model backends:
  - paddleocr       (classic PaddleOCR pipeline)
  - paddleocr-vl-1.5 (PaddleOCR Vision-Language model)

Usage:
  python -m ocr.runner \
    --input /path/to/image-list.json \
    --output /path/to/ocr-result.json \
    [--lang ch] [--model paddleocr-vl-1.5] [--device auto] [--source comics]
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

try:
    import paddle
    from paddleocr import PaddleOCR, PaddleOCRVL
except ImportError as error:
    print(f"[ERROR] Missing Python dependency: {error}. Run `bun run python:bootstrap` first.", file=sys.stderr)
    sys.exit(2)

from .geometry import (
    build_line_item,
    build_line_item_with_polygon,
    to_plain_value,
)


SUPPORTED_MODELS = {"paddleocr", "paddleocr-vl-1.5"}


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Run PaddleOCR on a list of image or PDF files and emit JSON metadata.")
    parser.add_argument("--input", required=True, help="Path to JSON file containing list of image or PDF paths.")
    parser.add_argument("--output", required=True, help="Path to output JSON file.")
    parser.add_argument("--lang", default="ch", help="Language model for PaddleOCR.")
    parser.add_argument("--model", default="paddleocr-vl-1.5", choices=sorted(SUPPORTED_MODELS), help="OCR model to run.")
    parser.add_argument("--device", default="auto", help="Device for PaddleOCR: auto, gpu:0, or cpu.")
    parser.add_argument("--source", default="comics", help="Logical source label written to the OCR output metadata.")
    return parser.parse_args()


def resolve_device(requested_device: str) -> str:
    """Resolve the compute device to use (gpu:0 or cpu)."""
    if requested_device != "auto":
        paddle.device.set_device(requested_device)
        return requested_device

    if paddle.device.is_compiled_with_cuda():
        try:
            paddle.device.set_device("gpu:0")
            return "gpu:0"
        except Exception:
            pass

    paddle.device.set_device("cpu")
    return "cpu"


def build_ocr_pipeline(
    lang: str = "ch",
    model: str = "paddleocr",
    device: str = "auto",
) -> tuple[Any, str, str, str]:
    """
    Build and return the OCR pipeline.

    Returns a tuple of (pipeline, resolved_device, engine_name, model_name).
    """
    resolved_device = resolve_device(device)

    if model == "paddleocr-vl-1.5":
        try:
            pipeline = PaddleOCRVL(
                pipeline_version="v1.5",
                device=resolved_device,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
            )
        except RuntimeError as error:
            message = str(error)
            if "requires additional dependencies" in message:
                raise RuntimeError(
                    "PaddleOCR-VL-1.5 dependencies are missing from the Poetry environment. Run `bun run python:bootstrap` after refreshing Poetry dependencies."
                ) from error
            raise

        return (
            pipeline,
            resolved_device,
            "PaddleOCR-VL",
            "PaddleOCR-VL-1.5",
        )

    return (
        _build_standard_pipeline(lang=lang, device=resolved_device),
        resolved_device,
        "PaddleOCR",
        "PaddleOCR",
    )


def _build_standard_pipeline(lang: str = "ch", device: str = "cpu") -> PaddleOCR:
    """Build a standard (non-VL) PaddleOCR pipeline."""
    return PaddleOCR(
        lang=lang,
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
    )


# ---------------------------------------------------------------------------
# Result extraction — converts raw PaddleOCR/VL predictions into line items
# ---------------------------------------------------------------------------


def extract_result_data(result_payload: Any, result_name: str) -> dict[str, Any]:
    """Unwrap the nested result payload to reach the inner data dict."""
    if not isinstance(result_payload, dict):
        raise ValueError(f"{result_name} payload must be a dictionary")

    data = result_payload.get("res", result_payload)
    if isinstance(data, str):
        data = json.loads(data)
    if isinstance(data, dict) and isinstance(data.get("res"), dict):
        data = data.get("res")
    if not isinstance(data, dict):
        raise ValueError(f"{result_name} payload is missing the res field")

    return data


def extract_result_input_path(result_payload: Any, default_file_path: str) -> str:
    """Extract the source image path from a result payload, falling back to default."""
    data = extract_result_data(result_payload, "OCR result")
    input_path = data.get("input_path")
    if isinstance(input_path, str) and input_path.strip():
        return input_path

    return default_file_path


def extract_result_payload(result_item: Any) -> dict[str, Any] | None:
    """Normalize a prediction result item into a plain dict."""
    if isinstance(result_item, dict):
        return result_item

    payload = getattr(result_item, "json", None)

    if callable(payload):
        payload = payload()

    if isinstance(payload, str):
        payload = json.loads(payload)

    return payload


def extract_page_lines_from_ocr_payload(result_payload: Any) -> list[dict[str, Any]]:
    """Extract OCR line items from a classic PaddleOCR result payload."""
    data = extract_result_data(result_payload, "PaddleOCR result")

    texts = list(to_plain_value(data.get("rec_texts")) or [])
    boxes = list(
        to_plain_value(data.get("rec_polys"))
        or to_plain_value(data.get("rec_boxes"))
        or to_plain_value(data.get("dt_polys"))
        or []
    )

    max_length = max(len(texts), len(boxes))
    page_lines = []

    for index in range(max_length):
        page_lines.append(build_line_item(texts[index] if index < len(texts) else "", boxes[index] if index < len(boxes) else None))

    return page_lines


def extract_page_lines_from_vl_payload(result_payload: Any) -> list[dict[str, Any]]:
    """
    Extract OCR line items from a PaddleOCR-VL result payload.

    Tries the spotting_res path first; falls back to parsing_res_list blocks.
    """
    data = extract_result_data(result_payload, "PaddleOCR-VL result")

    spotting_res = data.get("spotting_res")
    if isinstance(spotting_res, dict):
        texts = list(to_plain_value(spotting_res.get("rec_texts")) or [])
        boxes = list(to_plain_value(spotting_res.get("rec_polys")) or [])

        if not texts and not boxes:
            spotting_res = None
        else:
            max_length = max(len(texts), len(boxes))
            page_lines = []
            for index in range(max_length):
                page_lines.append(build_line_item(texts[index] if index < len(texts) else "", boxes[index] if index < len(boxes) else None))

            return page_lines

    parsing_res_list = data.get("parsing_res_list")
    if not isinstance(parsing_res_list, list):
        raise ValueError("PaddleOCR-VL result payload is missing spotting_res and parsing_res_list")

    page_lines = []
    for block in parsing_res_list:
        if isinstance(block, dict):
            block_text = str(block.get("block_content") or "").strip()
            block_box = to_plain_value(block.get("block_bbox"))
            block_polygon = to_plain_value(block.get("block_polygon_points"))
            if block_box is None:
                block_box = block_polygon
        else:
            block_text = str(getattr(block, "content", "") or "").strip()
            block_box = to_plain_value(getattr(block, "bbox", None))
            block_polygon = to_plain_value(getattr(block, "polygon_points", None))
            if block_box is None:
                block_box = block_polygon

        if not block_text:
            continue

        page_lines.append(build_line_item_with_polygon(block_text, block_box, block_polygon))

    return page_lines


# ---------------------------------------------------------------------------
# Main OCR orchestration
# ---------------------------------------------------------------------------


def do_ocr(
    image_paths: list[str],
    lang: str = "ch",
    model: str = "paddleocr",
    device: str = "auto",
    source: str = "comics",
) -> dict[str, Any]:
    """
    Run OCR on a list of image files and return structured page results.

    Returns a dict with metadata (engine, model, language, device, timestamp)
    and a list of pages, each containing recognized text lines with geometry.
    """
    if not isinstance(image_paths, list) or len(image_paths) == 0:
        raise ValueError("image_paths must be a non-empty list of file paths")

    pipeline, resolved_device, engine_name, model_name = build_ocr_pipeline(lang=lang, model=model, device=device)

    output_pages = []

    for index, file_path in enumerate(image_paths, start=1):
        if not os.path.exists(file_path):
            print(f"[WARN] Skipping missing file: {file_path}", file=sys.stderr)
            continue

        print(f"[INFO] Processing page {index}/{len(image_paths)}: {os.path.basename(file_path)}", file=sys.stderr)
        predictions = list(pipeline.predict(file_path))
        if len(predictions) == 0:
            continue

        for prediction_index, prediction in enumerate(predictions):
            result_payload = extract_result_payload(prediction)
            source_path = extract_result_input_path(result_payload, file_path)
            if model == "paddleocr-vl-1.5":
                page_lines = extract_page_lines_from_vl_payload(result_payload)
            else:
                page_lines = extract_page_lines_from_ocr_payload(result_payload)

            output_pages.append(
                {
                    "pageNumber": len(output_pages) + 1,
                    "fileName": os.path.basename(source_path),
                    "filePath": os.path.abspath(source_path),
                    "lines": page_lines,
                }
            )

    return {
        "source": source,
        "ocrEngine": engine_name,
        "ocrModel": model_name,
        "language": lang,
        "device": resolved_device,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "pageCount": len(output_pages),
        "pages": output_pages,
    }


def main() -> None:
    """Entry point: parse args, run OCR, write JSON output."""
    args = parse_args()

    if not os.path.exists(args.input):
        print(f"[ERROR] Input list file does not exist: {args.input}", file=sys.stderr)
        sys.exit(1)

    with open(args.input, "r", encoding="utf-8") as file_handle:
        inputs = json.load(file_handle)

    if not isinstance(inputs, list) or len(inputs) == 0:
        print("[ERROR] Input list must be a non-empty JSON array of image file paths.", file=sys.stderr)
        sys.exit(1)

    output_data = do_ocr(inputs, lang=args.lang, model=args.model, device=args.device, source=args.source)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as file_handle:
        json.dump(output_data, file_handle, ensure_ascii=False, indent=2)

    print(f"[INFO] OCR complete. Output written to: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
