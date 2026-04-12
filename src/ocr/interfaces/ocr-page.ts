import type { OcrLineItem } from "./ocr-line-item.ts";

/** OCR result for a single page image within an upload batch. */
export interface OcrPage {
  /** 1-based page number, corresponding to the order the image was processed. */
  pageNumber: number;
  /** Base filename of the source image (e.g. "page_001.png"). */
  fileName: string;
  /** Absolute path to the source image file on disk. */
  filePath: string;
  /** All text lines detected on this page, in reading order. */
  lines: OcrLineItem[];
}
