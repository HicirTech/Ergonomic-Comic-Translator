import type { TextLine } from "../../stages/lines/interfaces/index.ts";
import type { RegionResult } from "./region-result.ts";

export interface PageVisionResult {
  width: number;
  height: number;
  regions: RegionResult[];
  /** Lines outside every region; promoted only after the OCR gate (later stage). */
  uncovered: TextLine[];
  cleanedPath: string;
  timingsMs: Record<string, number>;
}
