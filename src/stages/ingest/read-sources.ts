import { readdirSync, readFileSync, statSync } from "fs";
import { basename, extname, join, relative } from "path";
import { hasSupportedExtension } from "../../core/path-utils.ts";
import { GiB } from "../../core/units.ts";
import { extractZipEntries } from "../../core/zip-utils.ts";
import { IngestLimitError } from "./ingest-limit-error.ts";
import type { IngestLimits, SourceEntry } from "./interfaces/index.ts";

/** Formats sharp decodes and browsers display. */
export const pageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"] as const;
export const archiveExtensions = [".zip", ".cbz"] as const;

export const defaultIngestLimits: IngestLimits = {
  maxEntries: 5000,
  maxTotalBytes: 4 * GiB,
  maxCompressionRatio: 200,
};

const readArchive = async (path: string, limits: IngestLimits): Promise<SourceEntry[]> => {
  let entries = 0;
  let totalBytes = 0;
  const extracted = await extractZipEntries(Bun.file(path), (info) => {
    if (info.name.endsWith("/")) return false;
    entries += 1;
    totalBytes += info.originalSize;
    if (entries > limits.maxEntries) {
      throw new IngestLimitError(`Archive has more than ${limits.maxEntries} entries`);
    }
    if (totalBytes > limits.maxTotalBytes) {
      throw new IngestLimitError(`Archive expands to more than ${limits.maxTotalBytes} bytes`);
    }
    if (info.size > 0 && info.originalSize / info.size > limits.maxCompressionRatio) {
      throw new IngestLimitError(`Entry ${info.name} is compressed ${Math.round(info.originalSize / info.size)}:1`);
    }
    return true;
  });
  return extracted.map((entry) => ({ name: entry.name, data: entry.data }));
};

const readFolder = (root: string, limits: IngestLimits): SourceEntry[] => {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) walk(path);
      else if (item.isFile()) files.push(path);
      if (files.length > limits.maxEntries) {
        throw new IngestLimitError(`Folder has more than ${limits.maxEntries} files`);
      }
    }
  };
  walk(root);
  let totalBytes = 0;
  return files.map((path) => {
    totalBytes += statSync(path).size;
    if (totalBytes > limits.maxTotalBytes) {
      throw new IngestLimitError(`Folder holds more than ${limits.maxTotalBytes} bytes`);
    }
    return { name: relative(root, path).split(/[\\/]/u).join("/"), data: readFileSync(path) };
  });
};

/**
 * Reads zip/cbz archives, folders (recursively) and single image files into raw entries. With several
 * sources, entries of an archive or folder are named under its own name, so pages sort chapter by chapter
 * instead of interleaving equal names such as 001.jpg.
 */
export const readSources = async (paths: readonly string[], limits: IngestLimits = defaultIngestLimits): Promise<SourceEntry[]> => {
  const entries: SourceEntry[] = [];
  for (const path of paths) {
    const prefix = paths.length > 1 ? `${basename(path)}/` : "";
    const named = (items: SourceEntry[]) => items.map((entry) => ({ name: `${prefix}${entry.name}`, data: entry.data }));
    if (statSync(path).isDirectory()) {
      entries.push(...named(readFolder(path, limits)));
    } else if (hasSupportedExtension(path, archiveExtensions)) {
      entries.push(...named(await readArchive(path, limits)));
    } else {
      entries.push({ name: basename(path), data: readFileSync(path) });
    }
  }
  return entries;
};

export const isPageFile = (name: string) => hasSupportedExtension(name, pageExtensions) && !basename(name).startsWith(".");

export const pageExtension = (name: string) => extname(name).toLowerCase();
