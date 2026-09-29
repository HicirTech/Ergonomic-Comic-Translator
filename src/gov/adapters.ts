import { GiB } from "../core/units.ts";
import type { DxgiAdapterDesc } from "../platform/win32/interfaces/index.ts";
import type { AdapterKind, GpuAdapter, GpuVendor } from "./interfaces/index.ts";

const vendorIds: Record<number, GpuVendor> = {
  0x10de: "nvidia",
  0x1002: "amd",
  0x8086: "intel",
  0x1414: "microsoft",
};

/**
 * Carve-outs below this cannot hold any tier plus headroom; such iGPUs (e.g. the 2-CU Radeon in desktop Ryzen,
 * measured slower than the CPU for detection) are left to the CPU.
 */
const umaMinimumCarveOutBytes = 2 * GiB;

export const vendorFromId = (vendorId: number): GpuVendor => vendorIds[vendorId] ?? "other";

/**
 * An AMD adapter is UMA when it reports shared memory and the RAM missing from the OS view
 * (installed minus visible) covers at least 80 % of its "dedicated" memory, i.e. the carve-out came from RAM.
 */
export const isUmaCarveOut = (desc: DxgiAdapterDesc, visibleRamBytes: number, installedRamBytes: number | null) =>
  vendorFromId(desc.vendorId) === "amd"
  && desc.sharedSystemMemoryBytes > 0
  && installedRamBytes !== null
  && installedRamBytes - visibleRamBytes >= 0.8 * desc.dedicatedVideoMemoryBytes;

const adapterKind = (desc: DxgiAdapterDesc, visibleRamBytes: number, installedRamBytes: number | null): AdapterKind => {
  const vendor = vendorFromId(desc.vendorId);
  if (vendor === "nvidia") {
    return "discrete";
  }
  if (vendor === "amd") {
    if (!isUmaCarveOut(desc, visibleRamBytes, installedRamBytes)) {
      return "discrete";
    }
    return desc.dedicatedVideoMemoryBytes >= umaMinimumCarveOutBytes ? "uma" : "unsupported";
  }
  // Intel GPUs are out of scope: vision and LLM run on the CPU instead.
  return "unsupported";
};

/**
 * Turns the raw DXGI list into the adapters the governor tracks: drops software and Microsoft adapters,
 * keeps only LUIDs that the WDDM counters report (DXGI can list one card several times under different
 * LUIDs), and removes remaining duplicates of the same vendor/device/memory size.
 */
export const selectAdapters = (
  descs: DxgiAdapterDesc[],
  counterLuids: ReadonlySet<string> | null,
  visibleRamBytes: number,
  installedRamBytes: number | null,
): GpuAdapter[] => {
  const seen = new Set<string>();
  const adapters: GpuAdapter[] = [];
  for (const desc of descs) {
    const vendor = vendorFromId(desc.vendorId);
    if (desc.software || vendor === "microsoft") {
      continue;
    }
    if (counterLuids && !counterLuids.has(desc.luid)) {
      continue;
    }
    const identity = `${desc.vendorId}:${desc.deviceId}:${desc.dedicatedVideoMemoryBytes}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    adapters.push({
      luid: desc.luid,
      name: desc.name,
      vendor,
      vendorId: desc.vendorId,
      deviceId: desc.deviceId,
      kind: adapterKind(desc, visibleRamBytes, installedRamBytes),
      deviceLocalBytes: desc.dedicatedVideoMemoryBytes,
      sharedSystemBytes: desc.sharedSystemMemoryBytes,
    });
  }
  return adapters;
};
