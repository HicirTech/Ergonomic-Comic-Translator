"""Text cleaner runner — removes text from comic page images using
lama_large inpainting, guided by PaddleOCR bounding boxes.

Pipeline:
  1. Read PaddleOCR bounding boxes from the OCR output JSON.
  2. Create a binary mask from those boxes (with configurable dilation).
  3. Inpaint masked regions with lama_large to erase text.

Usage:
  python -m textless.runner \
    --image /path/to/image.png \
    --ocr-json /path/to/ocr_output.json \
    --page-number 1 \
    --output /path/to/output.png \
    [--device auto] \
    [--inpainting-size 2560] \
    [--mask-dilation-offset 40] \
    [--passes 2]
"""

import argparse
import asyncio
import json
import os
import sys

import cv2
import numpy as np


def resolve_device(device_arg: str) -> str:
    """Resolve 'auto' device to the best available."""
    import torch

    if device_arg != "auto":
        return device_arg
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_ocr_boxes(ocr_json_path: str, page_number: int) -> list[dict]:
    """Load PaddleOCR line items for a specific page.

    Returns list of dicts with 'box' ([x1,y1,x2,y2]) and
    'polygon' ([[x,y],...]) fields.
    """
    with open(ocr_json_path, "r", encoding="utf-8") as f:
        ocr_output = json.load(f)

    for page in ocr_output.get("pages", []):
        if page.get("pageNumber") == page_number:
            items = []
            for line in page.get("lines", []):
                box = line.get("box")
                polygon = line.get("polygon")
                if box or polygon:
                    items.append({"box": box, "polygon": polygon})
            return items

    return []


def create_mask_from_lines(
    image_shape: tuple,
    ocr_lines: list[dict],
    dilation: int = 30,
) -> np.ndarray:
    """Create a binary mask from PaddleOCR line items.

    Uses polygon points when available for a tight mask that follows the text
    boundary (preserving speech bubble borders). Falls back to bounding box
    rectangles when polygon data is missing.
    """
    h, w = image_shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    for line in ocr_lines:
        polygon = line.get("polygon")
        box = line.get("box")

        if polygon and len(polygon) >= 3:
            pts = np.array(polygon, dtype=np.int32)
            cv2.fillPoly(mask, [pts], 255)
        elif box and len(box) == 4:
            x1, y1, x2, y2 = [int(v) for v in box]
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(w, x2)
            y2 = min(h, y2)
            mask[y1:y2, x1:x2] = 255

    if dilation > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilation * 2 + 1, dilation * 2 + 1)
        )
        mask = cv2.dilate(mask, kernel, iterations=1)

    return mask


async def run_inpainting(
    image: np.ndarray,
    mask: np.ndarray,
    device: str,
    inpainting_size: int,
) -> np.ndarray:
    """Run lama_large inpainting to erase text."""
    from .inpainting import dispatch, prepare
    from .config import Inpainter

    await prepare(Inpainter.lama_large, device=device)
    return await dispatch(
        Inpainter.lama_large,
        image,
        mask,
        config=None,
        inpainting_size=inpainting_size,
        device=device,
        verbose=False,
    )


async def clean_image_single_pass(
    image: np.ndarray,
    ocr_lines: list[dict],
    device: str,
    inpainting_size: int,
    mask_dilation_offset: int,
) -> np.ndarray:
    """Single pass: generate mask → inpaint."""
    if not ocr_lines:
        print("[INFO]   No OCR lines available, skipping", file=sys.stderr)
        return image

    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    mask = create_mask_from_lines(image.shape, ocr_lines, dilation=mask_dilation_offset)
    has_polygon = sum(1 for l in ocr_lines if l.get("polygon") and len(l["polygon"]) >= 3)
    print(
        f"[INFO]   Created mask from {len(ocr_lines)} OCR lines "
        f"({has_polygon} with polygon, dilation={mask_dilation_offset}px)",
        file=sys.stderr,
    )

    result_rgb = await run_inpainting(img_rgb, mask, device, inpainting_size)
    return cv2.cvtColor(result_rgb, cv2.COLOR_RGB2BGR)


async def clean_image(
    image_path: str,
    ocr_json_path: str,
    page_number: int,
    output_path: str,
    device: str,
    inpainting_size: int,
    mask_dilation_offset: int,
    passes: int,
) -> dict:
    """Full text cleaning pipeline with multiple passes."""
    image = cv2.imread(image_path)
    if image is None:
        return {"success": False, "error": f"Failed to read image: {image_path}"}

    ocr_lines = load_ocr_boxes(ocr_json_path, page_number)
    print(f"[INFO] Page {page_number}: {len(ocr_lines)} PaddleOCR text regions loaded", file=sys.stderr)

    if not ocr_lines:
        print("[INFO]   No text regions found, copying original image", file=sys.stderr)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cv2.imwrite(output_path, image)
        return {"success": True, "outputPath": output_path}

    current = image
    for i in range(passes):
        print(f"[INFO]   Pass {i + 1}/{passes}", file=sys.stderr)
        current = await clean_image_single_pass(
            current, ocr_lines, device, inpainting_size, mask_dilation_offset
        )
        # After first pass, no more OCR lines — only first pass uses them
        ocr_lines = []

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, current)
    print(f"[INFO]   Output written to: {output_path}", file=sys.stderr)

    return {"success": True, "outputPath": output_path}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Text cleaner runner")
    parser.add_argument("--image", required=True, help="Input image path")
    parser.add_argument("--ocr-json", required=True, help="OCR output JSON path")
    parser.add_argument("--page-number", type=int, required=True, help="1-based page number")
    parser.add_argument("--output", required=True, help="Output image path")
    parser.add_argument("--device", default="auto", help="Device: auto, cuda, cpu, mps")
    parser.add_argument("--inpainting-size", type=int, default=2560)
    parser.add_argument("--mask-dilation-offset", type=int, default=5)
    parser.add_argument("--passes", type=int, default=1, help="Number of cleaning passes")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    device = resolve_device(args.device)
    print(f"[INFO] Using device: {device}", file=sys.stderr)

    result = await clean_image(
        image_path=args.image,
        ocr_json_path=args.ocr_json,
        page_number=args.page_number,
        output_path=args.output,
        device=device,
        inpainting_size=args.inpainting_size,
        mask_dilation_offset=args.mask_dilation_offset,
        passes=args.passes,
    )

    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())
