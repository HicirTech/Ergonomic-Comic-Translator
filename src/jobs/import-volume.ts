import type { DataPaths } from "../core/data-paths.ts";
import type { VolumeStore } from "../db/volumes.ts";
import { ingestEntries } from "../stages/ingest/ingest.ts";
import { readSources } from "../stages/ingest/read-sources.ts";
import { classifyPages } from "../stages/profile/page-profile.ts";
import { makeThumbnail } from "../stages/profile/thumbnail.ts";

/**
 * S0 + S1 for dropped files: reads archives, folders and images into the page store, marks blank pages
 * and textless variants, and records the volume. No job is created; the user starts it after a look at
 * the page counts. Thumbnails are made one page at a time to keep memory flat on large volumes.
 */
export const importVolume = async (paths: DataPaths, volumes: VolumeStore, sourcePaths: readonly string[], title: string) => {
  const { pages, skipped } = await ingestEntries(await readSources(sourcePaths), paths.pages);
  if (pages.length === 0) {
    return { volumeId: null, pages: 0, blank: 0, textless: 0, skipped };
  }
  const thumbnails = [];
  for (const page of pages) {
    thumbnails.push(await makeThumbnail(page.storedPath, page.ordinal, page.width, page.height));
  }
  const kinds = classifyPages(thumbnails);
  const volumeId = volumes.create({
    title,
    pages: pages.map((page) => ({ page, kind: kinds.get(page.ordinal)! })),
    sourceLanguage: null,
    readingDirection: null,
  });
  const count = (kind: string) => [...kinds.values()].filter((entry) => entry.kind === kind).length;
  return { volumeId, pages: pages.length, blank: count("blank"), textless: count("textless_variant"), skipped };
};
