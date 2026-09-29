import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { writeFileAtomically } from "../../core/atomic-write.ts";
import { sha256Hex } from "../../core/hash.ts";
import { compareNatural } from "../../core/natural-sort.ts";
import { sanitizeArchiveEntryPath } from "../../core/path-utils.ts";
import type { IngestedPage, SkippedEntry, SourceEntry } from "./interfaces/index.ts";
import { isPageFile, pageExtension } from "./read-sources.ts";

/** Stores bytes under their hash; an existing file with the same hash is already the same content. */
const storeContent = (directory: string, sha256: string, extension: string, data: Uint8Array) => {
  const path = join(directory, `${sha256}${extension}`);
  if (!existsSync(path)) {
    writeFileAtomically(path, data);
  }
  return path;
};

/**
 * S0: turns source entries into pages. Order is the natural order of entry paths; identity is the
 * content hash plus that ordinal, never the file name (two chapters may both contain "01.jpg").
 * Identical images are kept once; files that are not images or do not decode are reported, not fatal.
 */
export const ingestEntries = async (entries: readonly SourceEntry[], pagesDirectory: string) => {
  mkdirSync(pagesDirectory, { recursive: true });
  const skipped: SkippedEntry[] = [];
  const candidates: { name: string; data: Uint8Array }[] = [];
  for (const entry of entries) {
    const name = sanitizeArchiveEntryPath(entry.name);
    if (!name) {
      skipped.push({ name: entry.name, reason: "empty_path" });
    } else if (!isPageFile(name)) {
      skipped.push({ name, reason: "unsupported_type" });
    } else {
      candidates.push({ name, data: entry.data });
    }
  }
  candidates.sort((a, b) => compareNatural(a.name, b.name));

  const seen = new Set<string>();
  const pages: IngestedPage[] = [];
  for (const candidate of candidates) {
    const sha256 = sha256Hex(candidate.data);
    if (seen.has(sha256)) {
      skipped.push({ name: candidate.name, reason: "duplicate" });
      continue;
    }
    const metadata = await sharp(candidate.data).metadata().catch(() => null);
    if (!metadata?.width || !metadata.height) {
      skipped.push({ name: candidate.name, reason: "undecodable" });
      continue;
    }
    seen.add(sha256);
    pages.push({
      ordinal: pages.length + 1,
      displayName: candidate.name,
      sha256,
      storedPath: storeContent(pagesDirectory, sha256, pageExtension(candidate.name), candidate.data),
      width: metadata.width,
      height: metadata.height,
    });
  }
  return { pages, skipped };
};
