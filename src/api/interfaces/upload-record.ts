/**
 * How the file arrived: a direct image upload, a PDF, a ZIP container, or an
 * individual file extracted from a ZIP.
 */
export type UploadRecordSourceType = "image" | "pdf" | "zip" | "zip-entry";

/** Metadata record for one file stored under a given upload batch. */
export interface UploadRecord {
  /** Shared identifier grouping all files from one HTTP upload request. */
  uploadId: string;
  /** How this file was originally provided. */
  sourceType: UploadRecordSourceType;
  /** Original filename as provided by the client. */
  originalName: string;
  /** Filename as saved on disk (may differ from originalName to avoid collisions). */
  storedName: string;
  /** Absolute path to the file on disk. */
  storedPath: string;
  /** Path relative to the API uploads root directory. */
  relativePath: string;
  /** MIME type supplied by the client, or null if not provided. */
  contentType: string | null;
  /** File size in bytes. */
  size: number;
  /** ISO 8601 timestamp of when this record was persisted. */
  createdAt: string;
  /** Name of the source ZIP archive if sourceType is "zip-entry"; null otherwise. */
  archiveName: string | null;
  /** Entry path within the source archive if sourceType is "zip-entry"; null otherwise. */
  archiveEntryName: string | null;
}
