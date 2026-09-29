import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);

/** The ORT build every model, self-check and cache key assumes; package.json pins it exactly. */
export const requiredOrtVersion = "1.30.0";

/**
 * Bundled Windows DLLs in load order. Preloading them by absolute path keeps Windows from resolving
 * the System32 copies that ship with Windows ML (onnxruntime.dll 1.17 segfaults with this binding, ORT #27888).
 */
export const bundledWindowsDlls = ["DirectML.dll", "dxil.dll", "dxcompiler.dll", "onnxruntime.dll"] as const;

export const ortPackageDirectory = () => dirname(require.resolve("onnxruntime-node/package.json"));

export const ortPackageVersion = () =>
  (JSON.parse(readFileSync(join(ortPackageDirectory(), "package.json"), "utf8")) as { version: string }).version;

export const ortNativeDirectory = (platform: NodeJS.Platform = process.platform, arch: string = process.arch) =>
  join(ortPackageDirectory(), "bin", "napi-v6", platform, arch);

/** Windows ML ships its own onnxruntime.dll here; its presence is why the preload is mandatory. */
export const systemOnnxRuntimeDll = () => {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const path = join(systemRoot, "System32", "onnxruntime.dll");
  return existsSync(path) ? path : null;
};
