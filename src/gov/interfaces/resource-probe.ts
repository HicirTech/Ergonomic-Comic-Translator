import type { GpuAdapter } from "./gpu-adapter.ts";
import type { ResourceSample } from "./resource-sample.ts";

export interface ResourceProbe {
  /** Adapters the governor tracks, fixed when the probe opens. */
  readonly adapters: readonly GpuAdapter[];
  /** Reads usage now; call about once per second so the utilisation rate counters have an interval. */
  sample(ownPids: ReadonlySet<number>): ResourceSample;
  close(): void;
}
