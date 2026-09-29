import { describe, expect, it } from "bun:test";
import { GiB, MiB } from "../../src/core/units.ts";
import { selectAdapters, vendorFromId } from "../../src/gov/adapters.ts";
import type { DxgiAdapterDesc } from "../../src/platform/win32/interfaces/index.ts";

const desc = (overrides: Partial<DxgiAdapterDesc>): DxgiAdapterDesc => ({
  name: "GPU",
  vendorId: 0x10de,
  deviceId: 1,
  luid: "0x00000000_0x00000001",
  dedicatedVideoMemoryBytes: 8 * GiB,
  dedicatedSystemMemoryBytes: 0,
  sharedSystemMemoryBytes: 15827 * MiB,
  software: false,
  ...overrides,
});

/** DXGI output of the owner's development machine: one RTX 5090 listed three times, a 2-CU AMD iGPU, WARP. */
const devMachine: DxgiAdapterDesc[] = [
  desc({ name: "AMD Radeon(TM) Graphics", vendorId: 0x1002, deviceId: 5056, luid: "0x00000000_0x0001a2cb", dedicatedVideoMemoryBytes: 486 * MiB }),
  desc({ name: "NVIDIA GeForce RTX 5090", deviceId: 11141, luid: "0x00000000_0x00018555", dedicatedVideoMemoryBytes: 32187 * MiB }),
  desc({ name: "NVIDIA GeForce RTX 5090", deviceId: 11141, luid: "0x00000000_0x00026bdf", dedicatedVideoMemoryBytes: 32187 * MiB }),
  desc({ name: "NVIDIA GeForce RTX 5090", deviceId: 11141, luid: "0x00000000_0x00024637", dedicatedVideoMemoryBytes: 32187 * MiB }),
  desc({ name: "Microsoft Basic Render Driver", vendorId: 0x1414, deviceId: 140, luid: "0x00000000_0x0001a255", dedicatedVideoMemoryBytes: 0, software: true }),
];
const devCounterLuids = new Set(["0x00000000_0x00018555", "0x00000000_0x0001a255", "0x00000000_0x0001a2cb"]);

describe("selectAdapters", () => {
  it("keeps the counted 5090 LUID once, leaves the 0.5 GB iGPU to the CPU and drops WARP", () => {
    const adapters = selectAdapters(devMachine, devCounterLuids, 31653 * MiB, 32 * GiB);
    expect(adapters.map((adapter) => [adapter.name, adapter.luid, adapter.kind])).toEqual([
      ["AMD Radeon(TM) Graphics", "0x00000000_0x0001a2cb", "unsupported"],
      ["NVIDIA GeForce RTX 5090", "0x00000000_0x00018555", "discrete"],
    ]);
  });

  it("dedupes by vendor, device and memory when counters are unavailable", () => {
    const adapters = selectAdapters(devMachine, null, 31653 * MiB, 32 * GiB);
    expect(adapters.filter((adapter) => adapter.vendor === "nvidia")).toHaveLength(1);
  });

  it("recognises an 8 GiB carve-out on the 8845HS test machine", () => {
    const igpu = desc({ name: "AMD Radeon 780M Graphics", vendorId: 0x1002, luid: "0x0_0x2", dedicatedVideoMemoryBytes: 8 * GiB });
    const [adapter] = selectAdapters([igpu], null, 23.8 * GiB, 32 * GiB);
    expect(adapter!.kind).toBe("uma");
    expect(adapter!.deviceLocalBytes).toBe(8 * GiB);
  });

  it("treats an AMD card as discrete when installed RAM does not explain its memory", () => {
    const card = desc({ vendorId: 0x1002, luid: "0x0_0x3", dedicatedVideoMemoryBytes: 16 * GiB });
    expect(selectAdapters([card], null, 31.5 * GiB, 32 * GiB)[0]!.kind).toBe("discrete");
    expect(selectAdapters([card], null, 31.5 * GiB, null)[0]!.kind).toBe("discrete");
  });

  it("marks Intel GPUs unsupported", () => {
    const intel = desc({ vendorId: 0x8086, luid: "0x0_0x4" });
    expect(selectAdapters([intel], null, 16 * GiB, 16 * GiB)[0]!.kind).toBe("unsupported");
  });
});

describe("vendorFromId", () => {
  it("maps PCI vendor ids", () => {
    expect([0x10de, 0x1002, 0x8086, 0x1414, 0x5143].map(vendorFromId)).toEqual(["nvidia", "amd", "intel", "microsoft", "other"]);
  });
});
