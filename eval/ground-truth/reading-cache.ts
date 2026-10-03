import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomically } from "../../src/core/atomic-write.ts";
import { cacheKey } from "../../src/core/cache-key.ts";
import type { ModelsLock } from "../../src/models/interfaces/index.ts";
import { readModelsLock } from "../../src/models/lock.ts";
import { readingParameters } from "./confirm-textless.ts";
import type { CachedCluster, ClusterPage, ClusterReading, MemberReading, PairDifference } from "./interfaces/index.ts";

/** What readCluster reads with: the line recognizer of the text-rec engine, and manga-ocr with its vocabulary. */
const recognizerModelIds = ["ppocr-rec-server", "manga-ocr", "manga-ocr-vocab"] as const;

/** Raise when readCluster starts measuring differently for a reason the key does not include. */
const readingCacheVersion = 2;

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
 * The readings of a cluster measured before with the same settings and models, under this ingest's
 * ordinals (members ascending by ordinal); null when there is no such entry.
 */
export const loadReadings = (directory: string, pages: readonly ClusterPage[], key = readingCacheKey(pages)): ClusterReading | null => {
  const path = entryPath(directory, key);
  if (!existsSync(path)) return null;
  const entry = JSON.parse(readFileSync(path, "utf8")) as CachedCluster;
  const bySha = new Map(entry.members.map((reading) => [reading.sha256, reading]));
  const ordinalOf = new Map(pages.map((page) => [page.sha256, page.ordinal]));
  const members: MemberReading[] = [];
  for (const page of [...pages].sort((a, b) => a.ordinal - b.ordinal)) {
    const cached = bySha.get(page.sha256);
    if (!cached) return null;
    members.push({ ordinal: page.ordinal, readBoxCount: cached.readBoxCount, readableBoxCount: cached.readableBoxCount });
  }
  const differences: PairDifference[] = [];
  for (const difference of entry.differences) {
    const a = ordinalOf.get(difference.first);
    const b = ordinalOf.get(difference.second);
    if (a === undefined || b === undefined) return null;
    differences.push({ first: Math.min(a, b), second: Math.max(a, b), share: difference.share });
  }
  return { members, differences };
};

/** Stores a cluster's readings by content. A cluster that holds the same page twice cannot be told apart and is not stored. */
export const saveReadings = (directory: string, pages: readonly ClusterPage[], reading: ClusterReading, key = readingCacheKey(pages)) => {
  const shaOf = new Map(pages.map((page) => [page.ordinal, page.sha256]));
  if (new Set(shaOf.values()).size !== pages.length) return;
  const entry: CachedCluster = {
    members: reading.members.map((member) => ({
      sha256: shaOf.get(member.ordinal)!,
      readBoxCount: member.readBoxCount,
      readableBoxCount: member.readableBoxCount,
    })),
    differences: reading.differences.map((difference) => ({
      first: shaOf.get(difference.first)!,
      second: shaOf.get(difference.second)!,
      share: difference.share,
    })),
  };
  writeFileAtomically(entryPath(directory, key), JSON.stringify(entry));
};
