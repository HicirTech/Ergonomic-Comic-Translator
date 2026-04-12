/** A single text line detected and extracted by the OCR engine. */
export interface OcrLineItem {
  /** Zero-based index of this line within its page, assigned after merge. */
  lineIndex: number;
  /** Extracted text content. */
  text: string;
  /** Axis-aligned bounding box [x, y, width, height] in pixels, or null if unavailable. */
  box: [number, number, number, number] | null;
  /** Polygon vertices [[x,y], ...] tightly wrapping the text, or null if unavailable. */
  polygon: [number, number][] | null;
  /** Detected text orientation (e.g. "horizontal", "vertical"), or null if unavailable. */
  orientation: string | null;
}
