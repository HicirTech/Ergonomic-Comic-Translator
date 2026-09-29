import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import type { DataPaths } from "../core/data-paths.ts";
import { sanitizeArchiveEntryPath } from "../core/path-utils.ts";
import { extractZipEntries } from "../core/zip-utils.ts";
import { downloadFile } from "./download.ts";
import type { DownloadOptions, RuntimeAsset, RuntimesLock } from "./interfaces/index.ts";

const markerName = ".installed.json";

export const llamaCppDirectory = (paths: DataPaths, lock: RuntimesLock, assetName: string) =>
  join(paths.runtimes, "llama.cpp", `${lock.llamaCpp.build}-${assetName}`);

/** True when the asset was unpacked from the archive with the locked sha256. */
export const isRuntimeAssetInstalled = (paths: DataPaths, lock: RuntimesLock, assetName: string) => {
  const marker = join(llamaCppDirectory(paths, lock, assetName), markerName);
  return existsSync(marker) && JSON.parse(readFileSync(marker, "utf8")).sha256 === lock.llamaCpp.assets[assetName]?.sha256;
};

/** Assets for this platform: Vulkan (all vendors) plus the CPU build as fallback. */
export const defaultRuntimeAssets = (platform: NodeJS.Platform = process.platform, arch = process.arch) => {
  const prefix = `${platform}-${arch}`;
  return [`${prefix}-vulkan`, `${prefix}-cpu`];
};

/** Adds assets that a selected asset requires (the CUDA build needs the CUDA runtime DLLs). */
export const expandRuntimeAssets = (lock: RuntimesLock, names: readonly string[]) => {
  const selected: string[] = [];
  const visit = (name: string) => {
    const asset = lock.llamaCpp.assets[name];
    if (!asset) {
      throw new Error(`runtimes.lock.json has no asset "${name}"`);
    }
    if (!selected.includes(name)) {
      selected.push(name);
      asset.requires?.forEach(visit);
    }
  };
  names.forEach(visit);
  return selected;
};

const extractArchive = async (archivePath: string, targetDir: string) => {
  if (archivePath.endsWith(".zip")) {
    for (const entry of await extractZipEntries(Bun.file(archivePath))) {
      const relative = sanitizeArchiveEntryPath(entry.name);
      if (!relative) {
        continue;
      }
      const destination = join(targetDir, ...relative.split("/"));
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, entry.data);
    }
    return;
  }
  // Linux tarballs: GNU tar refuses absolute and parent paths by default.
  const tar = Bun.spawnSync(["tar", "-xzf", archivePath, "-C", targetDir]);
  if (tar.exitCode !== 0) {
    throw new Error(`tar failed for ${archivePath}: ${tar.stderr.toString()}`);
  }
};

/**
 * Downloads, verifies and unpacks one llama.cpp release asset into runtimes/llama.cpp/<build>-<asset>/.
 * A marker with the archive sha256 makes the call idempotent. Nothing is executed.
 */
export const installRuntimeAsset = async (
  paths: DataPaths,
  lock: RuntimesLock,
  assetName: string,
  options: DownloadOptions = {},
) => {
  const asset: RuntimeAsset | undefined = lock.llamaCpp.assets[assetName];
  if (!asset) {
    throw new Error(`runtimes.lock.json has no asset "${assetName}"`);
  }
  const targetDir = llamaCppDirectory(paths, lock, assetName);
  if (isRuntimeAssetInstalled(paths, lock, assetName)) {
    return { outcome: "present" as const, directory: targetDir };
  }

  const archivePath = join(paths.runtimes, "downloads", basename(new URL(asset.url).pathname));
  await downloadFile({ url: asset.url, destination: archivePath, size: asset.size, sha256: asset.sha256 }, options);

  const staging = `${targetDir}.staging`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  await extractArchive(archivePath, staging);
  writeFileSync(join(staging, markerName), JSON.stringify({ asset: assetName, sha256: asset.sha256, build: lock.llamaCpp.build }));
  rmSync(targetDir, { recursive: true, force: true });
  renameSync(staging, targetDir);
  return { outcome: "installed" as const, directory: targetDir };
};
