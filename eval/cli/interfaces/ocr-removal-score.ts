import type { DamageSplit } from "./damage-split.ts";

/** Text-removal scores of one page against the clean background and the glyph mask. */
export interface OcrRemovalScore {
  maskedMae: number;
  changesOutsideDilatedMask: number;
  strongResidualShare: number;
  /** The changed pixels outside the dilated mask, by where they sit and how that region was cleaned. */
  damage: DamageSplit;
}
