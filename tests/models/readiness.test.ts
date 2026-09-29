import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { dataPaths } from "../../src/core/data-paths.ts";
import { modelFilePath, readModelsLock, readRuntimesLock } from "../../src/models/lock.ts";
import { missingDownloads } from "../../src/models/readiness.ts";
import { defaultRuntimeAssets, llamaCppDirectory } from "../../src/models/runtime-install.ts";

describe("missingDownloads", () => {
  it("lists what is not on disk and accepts files with the locked size", () => {
    const root = mkdtempSync(join(tmpdir(), "ct-ready-"));
    try {
      const paths = dataPaths(root);
      const models = readModelsLock();
      const runtimes = readRuntimesLock();
      const before = missingDownloads(paths, models, runtimes);
      expect(before.models).toContain("font-noto-sans-sc-bold");
      expect(before.runtimes).toEqual(defaultRuntimeAssets());

      for (const file of models.models["font-noto-sans-sc-bold"]!.files) {
        const path = modelFilePath(paths.models, "font-noto-sans-sc-bold", file.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, new Uint8Array(file.size));
      }
      const [asset] = defaultRuntimeAssets();
      const directory = llamaCppDirectory(paths, runtimes, asset!);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, ".installed.json"), JSON.stringify({ sha256: runtimes.llamaCpp.assets[asset!]!.sha256 }));

      const after = missingDownloads(paths, models, runtimes);
      expect(after.models).not.toContain("font-noto-sans-sc-bold");
      expect(after.models.length).toBe(before.models.length - 1);
      expect(after.runtimes).toEqual(defaultRuntimeAssets().slice(1));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
