import type { OcrCrop } from "./ocr-crop.ts";

/** Crops of one page for one recognition engine. */
export interface OcrTask {
  imagePath: string;
  crops: OcrCrop[];
}
