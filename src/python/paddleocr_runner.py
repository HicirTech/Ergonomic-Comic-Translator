#!/usr/bin/env python3
import argparse
import json
import os
import sys

try:
    from paddleocr import PaddleOCR
except ImportError:
    print("Missing Python dependency: paddleocr. Install with `python -m pip install -r requirements.txt`.", file=sys.stderr)
    sys.exit(2)


def parse_args():
    parser = argparse.ArgumentParser(description="Run PaddleOCR on a list of image files and emit JSON metadata.")
    parser.add_argument("--input", required=True, help="Path to JSON file containing list of image paths.")
    parser.add_argument("--output", required=True, help="Path to output JSON file.")
    parser.add_argument("--lang", default="ch", help="Language model for PaddleOCR (default: ch).")
    return parser.parse_args()


def do_ocr(image_paths, lang="ch"):
    if not isinstance(image_paths, list) or len(image_paths) == 0:
        raise ValueError("image_paths must be a non-empty list of file paths")

    ocr = PaddleOCR(use_angle_cls=True, lang=lang, use_gpu=False)
    output_pages = []

    for index, file_path in enumerate(image_paths, start=1):
        if not os.path.exists(file_path):
            print(f"Skipping missing file: {file_path}", file=sys.stderr)
            continue

        ocr_result = ocr.ocr(file_path, cls=True)
        page_lines = []

        for line_item in ocr_result:
            box = line_item[0]
            text = line_item[1][0]
            confidence = float(line_item[1][1]) if len(line_item[1]) > 1 else None

            page_lines.append({
                "text": text,
                "confidence": confidence,
                "box": [list(map(float, point)) for point in box],
            })

        output_pages.append({
            "pageNumber": index,
            "fileName": os.path.basename(file_path),
            "filePath": os.path.abspath(file_path),
            "lines": page_lines,
        })

    return {
        "source": "comics",
        "ocrEngine": "PaddleOCR",
        "language": lang,
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "pageCount": len(output_pages),
        "pages": output_pages,
    }


def run_json(image_paths, lang="ch"):
    output_data = do_ocr(image_paths, lang=lang)
    return json.dumps(output_data, ensure_ascii=False, indent=2)


def main():
    args = parse_args()

    if not os.path.exists(args.input):
        print(f"Input list file does not exist: {args.input}", file=sys.stderr)
        sys.exit(1)

    with open(args.input, "r", encoding="utf-8") as f:
        inputs = json.load(f)

    if not isinstance(inputs, list) or len(inputs) == 0:
        print("Input list must be a non-empty JSON array of image file paths.", file=sys.stderr)
        sys.exit(1)

    output_data = do_ocr(inputs, lang=args.lang)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"OCR complete. Output written to: {args.output}")


if __name__ == "__main__":
    main()