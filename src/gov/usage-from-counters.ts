import type { PdhGpuSample } from "../platform/win32/interfaces/index.ts";
import type { AdapterUsage, GpuAdapter } from "./interfaces/index.ts";

/**
 * Reduces one PDH collection to per-adapter usage. Per-process readings larger than the adapter can hold
 * are counter glitches (547,438 MB was observed once) and are dropped. External utilisation is the busiest
 * engine type, summed over processes that are not ours, like Task Manager's per-GPU figure.
 */
export const usageFromCounters = (
  adapters: readonly GpuAdapter[],
  counters: PdhGpuSample,
  ownPids: ReadonlySet<number>,
): AdapterUsage[] =>
  adapters.map((adapter) => {
    const system = counters.adapters.get(adapter.luid) ?? { dedicatedBytes: 0, sharedBytes: 0 };
    const capacity = adapter.deviceLocalBytes + adapter.sharedSystemBytes;

    let ownDedicatedBytes = 0;
    let ownSharedBytes = 0;
    for (const process of counters.processes) {
      if (process.luid !== adapter.luid || !ownPids.has(process.pid)) {
        continue;
      }
      if (process.dedicatedBytes <= capacity) {
        ownDedicatedBytes += process.dedicatedBytes;
      }
      if (process.sharedBytes <= capacity) {
        ownSharedBytes += process.sharedBytes;
      }
    }

    const perEngineType = new Map<string, number>();
    let rateKnown = false;
    for (const engine of counters.engines) {
      if (engine.luid !== adapter.luid || ownPids.has(engine.pid)) {
        continue;
      }
      if (Number.isNaN(engine.utilPct)) {
        continue;
      }
      rateKnown = true;
      perEngineType.set(engine.engineType, (perEngineType.get(engine.engineType) ?? 0) + engine.utilPct);
    }
    const busiest = Math.max(0, ...perEngineType.values());

    return {
      luid: adapter.luid,
      dedicatedUsedBytes: system.dedicatedBytes,
      sharedUsedBytes: system.sharedBytes,
      ownDedicatedBytes,
      ownSharedBytes,
      externalUtilPct: rateKnown ? Math.min(100, busiest) : Number.NaN,
    };
  });
