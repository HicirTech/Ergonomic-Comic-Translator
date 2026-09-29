import { existsSync } from "fs";
import { join, resolve } from "path";
import { loadedModulePath, loadLibrary, lastError } from "../platform/win32/kernel32.ts";
import { bundledWindowsDlls, ortNativeDirectory, ortPackageVersion, requiredOrtVersion } from "./runtime-files.ts";

const samePath = (left: string, right: string) => resolve(left).toLowerCase() === resolve(right).toLowerCase();

/**
 * Makes sure the ONNX Runtime about to be used is the bundled 1.30.0 build. On Windows it preloads the
 * bundled DLLs by absolute path and checks which onnxruntime.dll the process actually holds.
 * Call before the first import of onnxruntime-node; throws (fail fast) on any mismatch.
 */
export const preloadOnnxRuntime = () => {
  const version = ortPackageVersion();
  if (version !== requiredOrtVersion) {
    throw new Error(`onnxruntime-node ${version} is installed, but ${requiredOrtVersion} is required`);
  }
  if (process.platform !== "win32") {
    return { version, dllPath: null };
  }

  const directory = ortNativeDirectory();
  for (const name of bundledWindowsDlls) {
    const path = join(directory, name);
    if (!existsSync(path)) {
      throw new Error(`Bundled ONNX Runtime file is missing: ${path}`);
    }
    if (!loadLibrary(path)) {
      throw new Error(`LoadLibraryW failed for ${path} (Win32 error ${lastError()})`);
    }
  }

  const expected = join(directory, "onnxruntime.dll");
  const loaded = loadedModulePath("onnxruntime.dll");
  if (!loaded || !samePath(loaded, expected)) {
    throw new Error(`Wrong onnxruntime.dll loaded: ${loaded ?? "none"} (expected ${expected})`);
  }
  return { version, dllPath: loaded };
};
