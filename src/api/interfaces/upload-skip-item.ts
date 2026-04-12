/** Describes one file that was skipped during archive extraction or upload processing. */
export interface UploadSkipItem {
  /** Name of the skipped file or archive entry. */
  name: string;
  /** Human-readable explanation of why the file was skipped. */
  reason: string;
}
