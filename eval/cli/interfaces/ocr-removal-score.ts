/** Text-removal scores of one page against the clean background and the glyph mask. */
export interface OcrRemovalScore {
  maskedMae: number;
  changesOutsideDilatedMask: number;
  strongResidualShare: number;
}
