import type { DataPaths } from "../core/data-paths.ts";
import type { VolumeStore } from "../db/volumes.ts";
import { ingestEntries } from "../stages/ingest/ingest.ts";
import { readSources } from "../stages/ingest/read-sources.ts";
import type { PageKind } from "../stages/profile/interfaces/index.ts";
import { classifyPages } from "../stages/profile/page-profile.ts";
import { makeThumbnail } from "../stages/profile/thumbnail.ts";

/**
 * classifyPages also pairs near-identical pages as "textless variants", but on a real CG volume more than
 * half of those pairs were dialogue variants of one picture with readable text on both pages. Only blankness
 * is trusted: every other page is read, and a page that really has no text comes back unchanged.
 */
const storedKind = (kind: PageKind): PageKind => (kind.kind === "blank" ? kind : { kind: "main" });

/**
 * S0 + S1 for dropped files: reads archives, folders and images into the page store, marks blank pages,
 * and records the volume. No job is created; the user starts it after a look at the page counts.
 * Thumbnails are made one page at a time to keep memory flat on large volumes.
 */
export const importVolume = async (paths: DataPaths, volumes: VolumeStore, sourcePaths: readonly string[], title: string) => {
  const { pages, skipped } = await ingestEntries(await readSources(sourcePaths), paths.pages);
  if (pages.length === 0) {
    return { volumeId: null, pages: 0, blank: 0, skipped };
  }
  const thumbnails = [];
  for (const page of pages) {
    thumbnails.push(await makeThumbnail(page.storedPath, page.ordinal, page.width, page.height));
  }
  const kinds = classifyPages(thumbnails);
  const stored = pages.map((page) => ({ page, kind: storedKind(kinds.get(page.ordinal)!) }));
  const volumeId = volumes.create({ title, pages: stored, sourceLanguage: null, readingDirection: null });
  return { volumeId, pages: pages.length, blank: stored.filter(({ kind }) => kind.kind === "blank").length, skipped };
};
