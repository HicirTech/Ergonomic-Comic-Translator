import type { DataPaths } from "../core/data-paths.ts";
import { isPresent } from "./download.ts";
import type { ModelsLock, RuntimesLock } from "./interfaces/index.ts";
import { modelDownloadItems } from "./lock.ts";
import { expandModelSelection } from "./packs.ts";
import { defaultRuntimeAssets, isRuntimeAssetInstalled } from "./runtime-install.ts";

/** What a translate job needs on disk: the vision models, the lettering font and the default LLM tiers. */
export const requiredModelPacks = ["vision", "fonts", "llm"] as const;

/** Model ids and llama.cpp builds that are not on disk yet (sizes only, so it is fast enough per request). */
export const missingDownloads = (paths: DataPaths, modelsLock: ModelsLock, runtimesLock: RuntimesLock) => ({
  models: expandModelSelection(requiredModelPacks).filter((id) => modelDownloadItems(modelsLock, [id], paths).some((item) => !isPresent(item))),
  runtimes: defaultRuntimeAssets().filter((asset) => !isRuntimeAssetInstalled(paths, runtimesLock, asset)),
});
