import type { LockedModel } from "./locked-model.ts";

export interface ModelsLock {
  version: 1;
  models: Record<string, LockedModel>;
}
