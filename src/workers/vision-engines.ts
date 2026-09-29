import type { VisionEngine } from "./interfaces/index.ts";

/** Engines a vision worker can host, keyed by the name used in load/task requests. */
export const visionEngineFactories: Record<string, () => VisionEngine> = {
};
