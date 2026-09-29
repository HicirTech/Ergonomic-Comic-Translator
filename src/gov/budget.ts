import { deviceHeadroomBytes } from "./headroom.ts";
import type { AdapterUsage, DeviceBudget, GpuAdapter } from "./interfaces/index.ts";

/** Current device-local usage of other processes; per-process readings can glitch, so never below 0. */
export const externalDedicatedBytes = (usage: AdapterUsage) =>
  Math.max(0, usage.dedicatedUsedBytes - usage.ownDedicatedBytes);

/**
 * Budget for new loads on one adapter: device-local memory minus the external peak over the observation
 * window, minus the headroom left for other applications, minus what our own processes already hold.
 */
export const deviceBudget = (adapter: GpuAdapter, usage: AdapterUsage, externalPeakBytes: number): DeviceBudget => {
  const externalPeak = Math.max(externalPeakBytes, externalDedicatedBytes(usage));
  const headroomBytes = deviceHeadroomBytes(adapter);
  return {
    luid: adapter.luid,
    kind: adapter.kind,
    deviceLocalBytes: adapter.deviceLocalBytes,
    externalPeakBytes: externalPeak,
    headroomBytes,
    ownBytes: usage.ownDedicatedBytes,
    availableBytes: Math.max(0, adapter.deviceLocalBytes - externalPeak - headroomBytes - usage.ownDedicatedBytes),
  };
};
