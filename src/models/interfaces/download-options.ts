import type { DownloadProgress } from "./download-progress.ts";

export interface DownloadOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}
