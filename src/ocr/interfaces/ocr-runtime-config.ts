import type { OcrModel } from "../config/ocr-model.ts";

/** Active OCR configuration resolved from environment variables at startup. */
export interface OcrRuntimeConfig {
  /** The PaddleOCR model variant to use for inference. */
  model: OcrModel;
  /** PaddleOCR language code or alias (e.g. "ch", "japan"). */
  language: string;
  /** Compute device: "auto", "cpu", or a GPU specifier like "gpu:0". */
  device: string;
  /** Maximum number of pages to process concurrently. */
  concurrency: number;
}
