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
  /** How the region was cleaned: membrane fill, model inpainting, kept (SFX), or nothing to remove. */
  clean: "membrane" | "inpaint" | "kept" | "none";
  /** Colour of the paper next to the removed text; null when the region was not cleaned. */
  paper: [number, number, number] | null;
  /** Colour the removed text was set in; null when the region was not cleaned. */
  ink: [number, number, number] | null;
  /** Colour of the outline the removed text had; null when it had none or the region was not cleaned. */
  outline: [number, number, number] | null;
  /**
   * The inside of the bubble around the text: the detector's bubble box cut back to the frame the page shows
   * beside the text. Null without a bubble.
   */
  inside: Box | null;
}
