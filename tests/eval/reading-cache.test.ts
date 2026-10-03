import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ModelsLock } from "../../src/models/interfaces/index.ts";
import { readModelsLock } from "../../src/models/lock.ts";
import type { ClusterPage, ClusterReading } from "../../eval/ground-truth/interfaces/index.ts";
import { loadReadings, readingCacheKey, saveReadings } from "../../eval/ground-truth/reading-cache.ts";

const pages: ClusterPage[] = [
  { ordinal: 4, sha256: "a".repeat(64) },
  { ordinal: 9, sha256: "b".repeat(64) },
];
const readings: ClusterReading = {
  members: [
    { ordinal: 4, readBoxCount: 3, readableBoxCount: 3 },
    { ordinal: 9, readBoxCount: 3, readableBoxCount: 0 },
  ],
  differences: [{ first: 4, second: 9, share: 0.12 }],
};

const withDirectory = (test: (directory: string) => void) => {
  const directory = mkdtempSync(join(tmpdir(), "ct-readings-"));
  try {
    test(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("textless reading cache", () => {
  it("returns nothing for a cluster it has not stored", () => {
    withDirectory((directory) => expect(loadReadings(directory, pages)).toBeNull());
  });

  it("gives the stored readings back under the ordinals of a later ingest, ascending", () => {
    withDirectory((directory) => {
      saveReadings(directory, pages, readings);
      expect(loadReadings(directory, pages)).toEqual(readings);
      const reingested: ClusterPage[] = [{ ordinal: 12, sha256: "b".repeat(64) }, { ordinal: 2, sha256: "a".repeat(64) }];
      expect(loadReadings(directory, reingested)).toEqual({
        members: [
          { ordinal: 2, readBoxCount: 3, readableBoxCount: 3 },
          { ordinal: 12, readBoxCount: 3, readableBoxCount: 0 },
        ],
        differences: [{ first: 2, second: 12, share: 0.12 }],
      });
    });
  });

  it("misses when the cluster gained a page", () => {
    withDirectory((directory) => {
      saveReadings(directory, pages, readings);
      expect(loadReadings(directory, [...pages, { ordinal: 10, sha256: "c".repeat(64) }])).toBeNull();
    });
  });

  it("does not store a cluster that holds the same page twice", () => {
    withDirectory((directory) => {
      const twice: ClusterPage[] = [{ ordinal: 1, sha256: "a".repeat(64) }, { ordinal: 2, sha256: "a".repeat(64) }];
      saveReadings(directory, twice, {
        members: [
          { ordinal: 1, readBoxCount: 1, readableBoxCount: 1 },
          { ordinal: 2, readBoxCount: 1, readableBoxCount: 0 },
        ],
        differences: [{ first: 1, second: 2, share: 0.1 }],
      });
      expect(loadReadings(directory, twice)).toBeNull();
    });
  });

  it("keys by content regardless of order, and changes the key when a recognizer file changes", () => {
    const lock = readModelsLock();
    expect(readingCacheKey([...pages].reverse(), lock)).toBe(readingCacheKey(pages, lock));
    const recognizer = lock.models["manga-ocr"]!;
    const changed: ModelsLock = {
      ...lock,
      models: { ...lock.models, "manga-ocr": { ...recognizer, files: recognizer.files.map((file) => ({ ...file, sha256: "0".repeat(64) })) } },
    };
    expect(readingCacheKey(pages, changed)).not.toBe(readingCacheKey(pages, lock));
  });
});
