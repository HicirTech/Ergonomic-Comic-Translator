/** A single translated text line, identified by its index within the page. */
export interface TranslatedLine {
  /** Zero-based index matching OcrLineItem.lineIndex on the source page. */
  lineIndex: number;
  /** The translated text for this line. */
  translated: string;
}

/** All translated lines for one page. */
export interface TranslatedPage {
  /** 1-based page number matching the OCR output. */
  pageNumber: number;
  /** Translated lines in lineIndex order. */
  lines: TranslatedLine[];
}

/** Full translation output for an upload: one entry per translated page. */
export type TranslationOutput = TranslatedPage[];
