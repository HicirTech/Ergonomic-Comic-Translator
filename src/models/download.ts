import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from "fs";
import { dirname } from "path";
import { sha256File } from "../core/hash.ts";
import type { DownloadItem, DownloadOptions } from "./interfaces/index.ts";

const partialPath = (destination: string) => `${destination}.part`;

const fileSize = (path: string) => (existsSync(path) ? statSync(path).size : 0);

/** True when the file exists with the locked size and sha256. */
export const isInstalled = async (item: DownloadItem) =>
  fileSize(item.destination) === item.size && (await sha256File(item.destination)) === item.sha256;

const streamToPart = async (item: DownloadItem, offset: number, options: DownloadOptions) => {
  const doFetch = options.fetch ?? fetch;
  const part = partialPath(item.destination);
  const response = await doFetch(item.url, {
    headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
    signal: options.signal,
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status} for ${item.url}`);
  }

  // A server that ignores Range answers 200 with the whole file: start over instead of appending.
  const resumed = response.status === 206;
  let received = resumed ? offset : 0;
  const fd = openSync(part, resumed ? "a" : "w");
  try {
    for await (const chunk of response.body) {
      writeSync(fd, chunk);
      received += chunk.byteLength;
      if (received > item.size) {
        throw new Error(`Download larger than the locked size (${item.size} bytes): ${item.url}`);
      }
      options.onProgress?.({ destination: item.destination, receivedBytes: received, totalBytes: item.size });
    }
  } finally {
    closeSync(fd);
  }
};

/**
 * Downloads one locked file: writes `<destination>.part`, resumes an interrupted part with an HTTP Range
 * request, checks size and sha256, then renames atomically. A file whose hash does not match is never used.
 */
export const downloadFile = async (item: DownloadItem, options: DownloadOptions = {}) => {
  mkdirSync(dirname(item.destination), { recursive: true });
  if (existsSync(item.destination)) {
    if (await isInstalled(item)) {
      return "present" as const;
    }
    rmSync(item.destination);
  }

  const part = partialPath(item.destination);
  if (fileSize(part) > item.size) {
    rmSync(part);
  }
  const offset = fileSize(part);
  if (offset < item.size) {
    await streamToPart(item, offset, options);
  }

  const size = fileSize(part);
  if (size !== item.size) {
    throw new Error(`Incomplete download (${size} of ${item.size} bytes): ${item.url}`);
  }
  const hash = await sha256File(part);
  if (hash !== item.sha256) {
    rmSync(part);
    throw new Error(`sha256 mismatch for ${item.url}: expected ${item.sha256}, got ${hash}`);
  }
  renameSync(part, item.destination);
  return offset > 0 ? ("resumed" as const) : ("downloaded" as const);
};
