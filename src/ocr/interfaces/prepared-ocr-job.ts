/** Describes one unit of prepared OCR work: a single page image ready for inference. */
export interface PreparedOcrJob {
  /** Absolute path to the image file that will be fed to the OCR engine. */
  inputPath: string;
  /** Directory where intermediate artifacts for this page are stored. */
  artifactsDir: string;
  /** Absolute path to the original source file (image or PDF) before preparation. */
  sourcePath: string;
  /** Base filename of the original source (used in output records). */
  sourceFileName: string;
  /** 0-based index of this source file within the upload batch. */
  sourceIndex: number;
  /** 1-based page number within the source file (always 1 for images). */
  sourcePageNumber: number;
  /** Total page count of the source file (always 1 for images). */
  sourcePageCount: number;
  /** Whether the source was a standalone image or a PDF page. */
  sourceType: "image" | "pdf";
}
