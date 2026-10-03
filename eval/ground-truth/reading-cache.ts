import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomically } from "../../src/core/atomic-write.ts";
import { cacheKey } from "../../src/core/cache-key.ts";
import type { ModelsLock } from "../../src/models/interfaces/index.ts";
import { readModelsLock } from "../../src/models/lock.ts";
import { readingParameters } from "./confirm-textless.ts";
import type { CachedReading, ClusterPage, MemberReading } from "./interfaces/index.ts";

/** What readCluster reads with: the line recognizer of the text-rec engine, and manga-ocr with its vocabulary. */
const recognizerModelIds = ["ppocr-rec-server", "manga-ocr", "manga-ocr-vocab"] as const;

/** Raise when readCluster starts reading differently for a reason the key does not include. */
const readingCacheVersion = 1;

/**
 * Key of one cluster's readings: its pages by content, the reading settings and the recognizer files.
 * The pages are sorted, so the key does not depend on page order.
 */
export const readingCacheKey = (pages: readonly ClusterPage[], lock: ModelsLock = readModelsLock()) =>
  cacheKey({
    kind: "textless-readings",
    version: readingCacheVersion,
    pages: pages.map((page) => page.sha256).sort(),
    parameters: readingParameters,
    recognizers: recognizerModelIds.map((id) => lock.models[id]?.files.map((file) => file.sha256) ?? null),
  });

const entryPath = (directory: string, key: string) => join(directory, `${key}.json`);

/**
 * The readings of a cluster read before with the same settings and models, under this ingest's ordinals
 * and ascending by ordinal; null when there is no such entry.
 */
export const loadReadings = (directory: string, pages: readonly ClusterPage[], key = readingCacheKey(pages)): MemberReading[] | null => {
  const path = entryPath(directory, key);
  if (!existsSync(path)) return null;
  const bySha = new Map((JSON.parse(readFileSync(path, "utf8")) as CachedReading[]).map((reading) => [reading.sha256, reading]));
  const readings: MemberReading[] = [];
  for (const page of [...pages].sort((a, b) => a.ordinal - b.ordinal)) {
    const cached = bySha.get(page.sha256);
    if (!cached) return null;
    readings.push({ ordinal: page.ordinal, readBoxCount: cached.readBoxCount, readableBoxCount: cached.readableBoxCount });
  }
  return readings;
};

/** Stores a cluster's readings by content. A cluster that holds the same page twice cannot be told apart and is not stored. */
export const saveReadings = (
  directory: string,
  pages: readonly ClusterPage[],
  readings: readonly MemberReading[],
  key = readingCacheKey(pages),
) => {
  const shaOf = new Map(pages.map((page) => [page.ordinal, page.sha256]));
  if (new Set(shaOf.values()).size !== pages.length) return;
  const entries: CachedReading[] = readings.map((reading) => ({
    sha256: shaOf.get(reading.ordinal)!,
    readBoxCount: reading.readBoxCount,
    readableBoxCount: reading.readableBoxCount,
  }));
  writeFileAtomically(entryPath(directory, key), JSON.stringify(entries));
};
