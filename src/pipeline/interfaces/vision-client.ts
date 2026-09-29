import type { Box } from "../../geometry/interfaces/index.ts";
import type { InpaintTask } from "../../stages/clean/interfaces/index.ts";
import type { Detection } from "../../stages/detect/interfaces/index.ts";
import type { TextLine } from "../../stages/lines/interfaces/index.ts";
import type { OcrCandidate, OcrCrop, OrientationReading } from "../../stages/ocr/interfaces/index.ts";

/** The model calls the page pipeline needs; implemented over worker processes, faked in tests. */
export interface VisionClient {
  detect(imagePath: string): Promise<{ width: number; height: number; detections: Detection[] }>;
  /** Lines per region box, or for the whole page when `regions` is null (one entry). */
  lines(imagePath: string, regions: Box[] | null): Promise<TextLine[][]>;
  /** PP-OCR line recognition, used as structure OCR for utterance splitting. */
  recognizeLines(imagePath: string, crops: OcrCrop[]): Promise<OcrCandidate[][]>;
  /** Utterance OCR with the main reader or the short-text reader. */
  readUtterances(imagePath: string, crops: OcrCrop[], engine: "baberu" | "manga-ocr"): Promise<OcrCandidate[][]>;
  orientation(imagePath: string, crops: OcrCrop[]): Promise<OrientationReading[][]>;
  inpaint(task: InpaintTask): Promise<void>;
}
