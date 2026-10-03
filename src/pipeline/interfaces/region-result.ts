import type { Box } from "../../geometry/interfaces/index.ts";
import type { TextLine } from "../../stages/lines/interfaces/index.ts";
import type { RegionClass, RegionOrientation } from "../../stages/regions/interfaces/index.ts";
import type { UtteranceResult } from "./utterance-result.ts";

export interface RegionResult {
  box: Box;
  cls: "text_bubble" | "text_free" | null;
  bubble: Box | null;
  lines: TextLine[];
  orientation: RegionOrientation;
  classification: RegionClass;
  utterances: UtteranceResult[];
  /** How the region was cleaned: flat fill, model inpainting, kept (SFX), or nothing to remove. */
  clean: "flat" | "inpaint" | "kept" | "none";
  /** Median colour of the paper around the removed text; null when the region was not cleaned. */
  paper: [number, number, number] | null;
}
