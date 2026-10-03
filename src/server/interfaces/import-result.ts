/** What an upload found, for the one-line confirmation before a job starts. */
export interface ImportResult {
  volumeId: string;
  title: string;
  pages: number;
  blank: number;
  skipped: number;
}
