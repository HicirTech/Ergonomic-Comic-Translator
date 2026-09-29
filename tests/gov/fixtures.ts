import { GiB, MiB } from "../../src/core/units.ts";
import type { AdapterUsage, GpuAdapter, HostMemory, LightSignals, ResourceSample } from "../../src/gov/interfaces/index.ts";

/** The owner's development GPU as DXGI reports it (32187 MiB). */
export const rtx5090: GpuAdapter = {
  luid: "0x00000000_0x00018555",
  name: "NVIDIA GeForce RTX 5090",
  vendor: "nvidia",
  vendorId: 0x10de,
  deviceId: 0x2b85,
  kind: "discrete",
  deviceLocalBytes: 32187 * MiB,
  sharedSystemBytes: 15827 * MiB,
};

/** The owner's small-VRAM test machine: Ryzen 7 8845HS, Radeon 780M, 8 GiB carve-out out of 32 GiB. */
export const radeon780m: GpuAdapter = {
  luid: "0x00000000_0x00001234",
  name: "AMD Radeon 780M Graphics",
  vendor: "amd",
  vendorId: 0x1002,
  deviceId: 0x1900,
  kind: "uma",
  deviceLocalBytes: 8 * GiB,
  sharedSystemBytes: 12 * GiB,
};

export const host = (overrides: Partial<HostMemory> = {}): HostMemory => ({
  totalPhysBytes: 31653 * MiB,
  availPhysBytes: 18 * GiB,
  commitLimitBytes: 53 * GiB,
  commitAvailBytes: 32 * GiB,
  installedBytes: 32 * GiB,
  ownPrivateBytes: 0,
  ...overrides,
});

export const usage = (adapter: GpuAdapter, overrides: Partial<AdapterUsage> = {}): AdapterUsage => ({
  luid: adapter.luid,
  dedicatedUsedBytes: 0,
  sharedUsedBytes: 0,
  ownDedicatedBytes: 0,
  ownSharedBytes: 0,
  externalUtilPct: 0,
  ...overrides,
});

export const sample = (adapters: AdapterUsage[], hostMemory = host(), takenAtMs = 0): ResourceSample => ({
  takenAtMs,
  adapters,
  host: hostMemory,
});

export const quietSignals = (overrides: Partial<LightSignals> = {}): LightSignals => ({
  throughputCliff: false,
  slowVisionRuns: false,
  deviceReset: false,
  ownSharedBaselineBytes: new Map(),
  availPhysTenSecondsAgoBytes: null,
  ...overrides,
});
