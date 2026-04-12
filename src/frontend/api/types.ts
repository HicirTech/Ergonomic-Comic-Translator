// ── Shared types ──────────────────────────────────────────────────────────────

export type UploadRecordSourceType = "image" | "pdf" | "zip" | "zip-entry";

export interface UploadRecord {
  uploadId: string;
  sourceType: UploadRecordSourceType;
  originalName: string;
  storedName: string;
  storedPath: string;
  relativePath: string;
  contentType: string | null;
  size: number;
  createdAt: string;
  archiveName: string | null;
  archiveEntryName: string | null;
}

/** All records belonging to one upload batch, grouped by uploadId. */
export interface UploadBatch {
  uploadId: string;
  records: UploadRecord[];
  /** ISO timestamp of the earliest record in this batch. */
  createdAt: string;
  /**
   * Number of prepared (rasterised) pages in the OCR prepare directory.
   * Present when pages have been extracted; undefined otherwise.
   */
  pageCount: number | undefined;
}

export type OcrJobStatus = "Ready" | "Queued" | "Processing" | "Completed";

export interface OcrLineItem {
  lineIndex: number;
  text: string;
  box: [number, number, number, number] | null;
  polygon: [number, number][] | null;
  orientation: string | null;
}

export interface OcrPageLines {
  pageNumber: number;
  lines: OcrLineItem[];
}

export interface TranslatedLine {
  lineIndex: number;
  translated: string;
}

export interface TranslationPageLines {
  pageNumber: number;
  lines: TranslatedLine[];
}

export interface ContextTerm {
  term: string;
  context: string;
}
