import { basename } from "path";
import { MiB } from "../core/units.ts";
import type { DownloadProgress } from "../models/interfaces/index.ts";

const printIntervalMs = 2000;

/** Prints download progress at most every two seconds per file, with throughput since the previous line. */
export const createProgressPrinter = (write: (line: string) => void = console.log) => {
  const last = new Map<string, { atMs: number; bytes: number }>();
  return (progress: DownloadProgress) => {
    const now = performance.now();
    const previous = last.get(progress.destination);
    const done = progress.receivedBytes === progress.totalBytes;
    if (previous && now - previous.atMs < printIntervalMs && !done) {
      return;
    }
    const rate = previous ? (progress.receivedBytes - previous.bytes) / MiB / ((now - previous.atMs) / 1000) : 0;
    last.set(progress.destination, { atMs: now, bytes: progress.receivedBytes });
    const percent = ((100 * progress.receivedBytes) / progress.totalBytes).toFixed(1);
    write(`  ${basename(progress.destination)}  ${percent}%  ${(progress.receivedBytes / MiB).toFixed(0)}/${(progress.totalBytes / MiB).toFixed(0)} MB  ${rate.toFixed(1)} MB/s`);
  };
};
