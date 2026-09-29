import { readFileSync } from "fs";
import { join, resolve } from "path";
import type { DataPaths } from "../core/data-paths.ts";
import type { DownloadItem, LockedFile, LockedModel, ModelsLock, RuntimesLock } from "./interfaces/index.ts";

const repoRoot = resolve(import.meta.dir, "../..");
export const modelsLockPath = join(repoRoot, "models.lock.json");
export const runtimesLockPath = join(repoRoot, "runtimes.lock.json");

const sha256Pattern = /^[0-9a-f]{64}$/;
const revisionPattern = /^[0-9a-f]{40}$/;
const repoPattern = /^[\w.-]+\/[\w.-]+$/;

const fail = (message: string): never => {
  throw new Error(`models.lock.json: ${message}`);
};

const checkFile = (modelId: string, file: LockedFile) => {
  const segments = file.path.split("/");
  if (!file.path || file.path.startsWith("/") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(`${modelId}: unsafe file path "${file.path}"`);
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    fail(`${modelId}/${file.path}: size must be a positive integer`);
  }
  if (!sha256Pattern.test(file.sha256)) {
    fail(`${modelId}/${file.path}: sha256 must be 64 lower-case hex digits`);
  }
};

const checkModel = (modelId: string, model: LockedModel) => {
  if (!repoPattern.test(model.repo)) fail(`${modelId}: invalid repo "${model.repo}"`);
  if (!revisionPattern.test(model.revision)) fail(`${modelId}: revision must be a full commit sha`);
  if (!model.license) fail(`${modelId}: licence is required`);
  if (!Array.isArray(model.files) || model.files.length === 0) fail(`${modelId}: files are required`);
  for (const file of model.files) checkFile(modelId, file);
};

/** Validates the lock strictly: a model without a pinned revision, licence and sha256 per file never installs. */
export const parseModelsLock = (value: unknown): ModelsLock => {
  const lock = value as ModelsLock;
  if (lock?.version !== 1 || typeof lock.models !== "object" || lock.models === null) {
    fail("expected { version: 1, models: {...} }");
  }
  for (const [modelId, model] of Object.entries(lock.models)) {
    checkModel(modelId, model);
  }
  return lock;
};

export const readModelsLock = (path = modelsLockPath) => parseModelsLock(JSON.parse(readFileSync(path, "utf8")));

export const readRuntimesLock = (path = runtimesLockPath) => {
  const lock = JSON.parse(readFileSync(path, "utf8")) as RuntimesLock;
  if (lock.version !== 1 || !lock.llamaCpp?.assets) {
    throw new Error("runtimes.lock.json: expected { version: 1, llamaCpp: { assets: {...} } }");
  }
  for (const [name, asset] of Object.entries(lock.llamaCpp.assets)) {
    if (!asset.url.startsWith("https://") || !sha256Pattern.test(asset.sha256) || !Number.isSafeInteger(asset.size)) {
      throw new Error(`runtimes.lock.json: asset ${name} needs an https url, a size and a sha256`);
    }
  }
  return lock;
};

/** Hugging Face endpoint; HF_ENDPOINT follows the huggingface_hub convention so a mirror can be chosen. */
export const huggingFaceEndpoint = (env: NodeJS.ProcessEnv = process.env) =>
  (env.HF_ENDPOINT?.trim() || "https://huggingface.co").replace(/\/+$/, "");

/** Where a locked file lives under the models root (the data directory's models/ folder). */
export const modelFilePath = (modelsRoot: string, modelId: string, relativePath: string) =>
  join(modelsRoot, modelId, ...relativePath.split("/"));

export const modelDownloadItems = (
  lock: ModelsLock,
  modelIds: readonly string[],
  paths: DataPaths,
  endpoint = huggingFaceEndpoint(),
): DownloadItem[] =>
  modelIds.flatMap((modelId) => {
    const model = lock.models[modelId] ?? fail(`unknown model id "${modelId}"`);
    return model.files.map((file) => ({
      url: `${endpoint}/${model.repo}/resolve/${model.revision}/${file.path}`,
      destination: modelFilePath(paths.models, modelId, file.path),
      size: file.size,
      sha256: file.sha256,
    }));
  });
