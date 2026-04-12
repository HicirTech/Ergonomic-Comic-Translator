import type { OcrPage } from "./ocr-page.ts";

/** Root output document produced by a completed OCR run over one upload batch. */
export interface OcrOutput {
  /** Display name of the upload batch (typically the uploadId). */
  source: string;
  /** Name of the OCR library or tool used (e.g. "paddleocr"). */
  ocrEngine: string;
  /** Model variant that ran inference (e.g. "PP-OCRv5"). */
  ocrModel: string;
  /** Language code or alias passed to the OCR engine. */
  language: string;
  /** Compute device used ("cpu", "gpu:0", etc.). */
  device: string;
  /** ISO 8601 timestamp of when this output was produced. */
  generatedAt: string;
  /** Total number of pages in this output. */
  pageCount: number;
  /** Per-page OCR results in page-number order. */
  pages: OcrPage[];
}
