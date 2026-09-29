import type { AdapterUsage } from "./adapter-usage.ts";
import type { HostMemory } from "./host-memory.ts";

export interface ResourceSample {
  takenAtMs: number;
  adapters: AdapterUsage[];
  host: HostMemory;
}
