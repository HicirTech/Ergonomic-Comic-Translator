// Downloads and unpacks the pinned llama.cpp build into the data directory. Never starts llama-server.
// usage: bun run runtimes:fetch [asset ...]   (default: this platform's vulkan + cpu builds)
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { readRuntimesLock } from "../models/lock.ts";
import { defaultRuntimeAssets, expandRuntimeAssets, installRuntimeAsset } from "../models/runtime-install.ts";
import { createProgressPrinter } from "./progress-printer.ts";

const args = process.argv.slice(2);
const lock = readRuntimesLock();
const paths = dataPaths(resolveDataRoot());
const assets = expandRuntimeAssets(lock, args.length > 0 ? args : defaultRuntimeAssets());

console.log(`llama.cpp ${lock.llamaCpp.release}（${lock.llamaCpp.build}）：${assets.join(", ")}`);
const printProgress = createProgressPrinter();
for (const asset of assets) {
  const result = await installRuntimeAsset(paths, lock, asset, { onProgress: printProgress });
  console.log(`${result.outcome === "present" ? "已存在" : "已安装"}（sha256 校验通过）：${result.directory}`);
}
