/**
 * How the pipeline treated the art lettering of one page. The lettering belongs to the clean background, so
 * the owner's rule says it is neither read with the dialogue, nor translated, nor erased.
 */
export interface OcrSfxScore {
  marks: number;
  /** Lines of regions matched to a text block whose centre lies on lettering: read and erased with the dialogue. */
  absorbedLines: number;
  /** Unmatched regions centred on lettering, by policy: translated ones break the rule, kept ones follow it. */
  translatedRegions: number;
  keptRegions: number;
  /** Pixels of the lettering boxes that cleaning changed, and all of their pixels. */
  damagedPixels: number;
  pixels: number;
}
