/** One file to fetch: where from, where to, and what it must hash to. */
export interface DownloadItem {
  url: string;
  destination: string;
  size: number;
  sha256: string;
}
