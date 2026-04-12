"""
OCR geometry utilities — bounding box and polygon normalization for PaddleOCR output.

Shared by the OCR runner to convert raw PaddleOCR coordinates into a consistent
[x1, y1, x2, y2] bbox + polygon format with line orientation inference.
"""

import math
from typing import Any


def to_plain_value(value: Any) -> Any:
    """Convert numpy/paddle arrays to plain Python values."""
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def normalize_box(box: Any) -> list[float] | None:
    """
    Normalize a bounding box into [x1, y1, x2, y2] format.

    Accepts either a flat [x1, y1, x2, y2] array or a list of [x, y] polygon
    points, collapsing them into a minimal axis-aligned bounding box.
    """
    box = to_plain_value(box)

    if box is None:
        return None

    if isinstance(box, list) and len(box) == 4 and all(not isinstance(point, (list, tuple, dict)) for point in box):
        x1, y1, x2, y2 = box
        return [float(x1), float(y1), float(x2), float(y2)]

    if isinstance(box, list):
        normalized_points = []

        for point in box:
            point = to_plain_value(point)
            if isinstance(point, list) and len(point) == 2:
                normalized_points.append([float(point[0]), float(point[1])])
            else:
                normalized_points.append(point)

        points = [point for point in normalized_points if isinstance(point, list) and len(point) == 2]
        if len(points) > 0:
            xs = [float(point[0]) for point in points]
            ys = [float(point[1]) for point in points]
            return [min(xs), min(ys), max(xs), max(ys)]

        return normalized_points

    return box


def bbox_to_polygon(box: list[float]) -> list[list[float]] | None:
    """Convert a [x1, y1, x2, y2] bbox to a 4-point polygon."""
    if not isinstance(box, list) or len(box) != 4:
        return None

    x1, y1, x2, y2 = box
    return [
        [float(x1), float(y1)],
        [float(x2), float(y1)],
        [float(x2), float(y2)],
        [float(x1), float(y2)],
    ]


def infer_line_orientation(box: Any) -> str | None:
    """Infer whether a text line is 'vertical' or 'horizontal' from its bounding geometry."""
    if not isinstance(box, list):
        return None

    if len(box) == 4 and all(not isinstance(point, (list, tuple, dict)) for point in box):
        x1, y1, x2, y2 = box
        return "vertical" if abs(float(y2) - float(y1)) > abs(float(x2) - float(x1)) else "horizontal"

    if len(box) < 2:
        return None

    longest_vector = None
    longest_length = -1.0

    for index in range(len(box)):
        point_a = box[index]
        point_b = box[(index + 1) % len(box)]
        if not isinstance(point_a, list) or not isinstance(point_b, list) or len(point_a) != 2 or len(point_b) != 2:
            continue

        delta_x = float(point_b[0]) - float(point_a[0])
        delta_y = float(point_b[1]) - float(point_a[1])
        length = math.hypot(delta_x, delta_y)
        if length > longest_length:
            longest_length = length
            longest_vector = (abs(delta_x), abs(delta_y))

    if longest_vector is None:
        return None

    return "vertical" if longest_vector[1] > longest_vector[0] else "horizontal"


def normalize_polygon(box: Any) -> list[list[float]] | None:
    """Extract polygon points from the raw box data.

    Returns a list of [x, y] pairs, or generates a rectangle polygon from a bbox."""
    raw = to_plain_value(box)
    if raw is None:
        return None

    # Already a list of [x, y] point pairs
    if isinstance(raw, list) and len(raw) >= 3:
        points = []
        for point in raw:
            point = to_plain_value(point)
            if isinstance(point, (list, tuple)) and len(point) == 2:
                points.append([float(point[0]), float(point[1])])
        if len(points) >= 3:
            return points

    # Fall back: generate rectangle polygon from normalized bbox
    normalized = normalize_box(box)
    if isinstance(normalized, list) and len(normalized) == 4:
        return bbox_to_polygon(normalized)

    return None


def build_line_item(text: str, box: Any = None) -> dict[str, Any]:
    """Build a single OCR line item with normalized bbox and polygon."""
    normalized_box = normalize_box(box)
    return {
        "text": text,
        "box": normalized_box,
        "polygon": normalize_polygon(box),
        "orientation": infer_line_orientation(normalized_box),
    }


def build_line_item_with_polygon(text: str, box: Any, polygon_points: Any) -> dict[str, Any]:
    """Build a line item where polygon_points are provided separately from the bbox."""
    normalized_box = normalize_box(box)
    polygon = normalize_polygon(polygon_points) if polygon_points else normalize_polygon(box)
    return {
        "text": text,
        "box": normalized_box,
        "polygon": polygon,
        "orientation": infer_line_orientation(normalized_box),
    }
