import type { RuntimeAsset } from "./runtime-asset.ts";

export interface RuntimesLock {
  version: 1;
  llamaCpp: {
    release: string;
    build: string;
    commit: string;
    license: string;
    /** Keyed by "<platform>-<arch>-<backend>", e.g. "win32-x64-vulkan". */
    assets: Record<string, RuntimeAsset>;
  };
}
