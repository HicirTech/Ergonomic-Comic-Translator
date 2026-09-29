import { describe, expect, it } from "bun:test";
import { GiB, MiB } from "../../src/core/units.ts";
import { usageFromCounters } from "../../src/gov/usage-from-counters.ts";
import type { PdhGpuSample } from "../../src/platform/win32/interfaces/index.ts";
import { rtx5090 } from "./fixtures.ts";

const counters = (overrides: Partial<PdhGpuSample>): PdhGpuSample => ({
  adapters: new Map([[rtx5090.luid, { dedicatedBytes: 10 * GiB, sharedBytes: 200 * MiB }]]),
  processes: [],
  engines: [],
  ...overrides,
});

describe("usageFromCounters", () => {
  it("separates our processes from everyone else and drops impossible readings", () => {
    const [usage] = usageFromCounters([rtx5090], counters({
      processes: [
        { pid: 10, luid: rtx5090.luid, dedicatedBytes: 2 * GiB, sharedBytes: 50 * MiB },
        { pid: 11, luid: rtx5090.luid, dedicatedBytes: 547_438 * MiB, sharedBytes: 0 },
        { pid: 99, luid: rtx5090.luid, dedicatedBytes: 7 * GiB, sharedBytes: 0 },
      ],
    }), new Set([10, 11]));
    expect(usage!.dedicatedUsedBytes).toBe(10 * GiB);
    expect(usage!.ownDedicatedBytes).toBe(2 * GiB);
    expect(usage!.ownSharedBytes).toBe(50 * MiB);
  });

  it("reports the busiest external engine type and ignores our own load", () => {
    const [usage] = usageFromCounters([rtx5090], counters({
      engines: [
        { pid: 99, luid: rtx5090.luid, engineType: "3D", utilPct: 60 },
        { pid: 98, luid: rtx5090.luid, engineType: "3D", utilPct: 35 },
        { pid: 99, luid: rtx5090.luid, engineType: "Compute_0", utilPct: 20 },
        { pid: 10, luid: rtx5090.luid, engineType: "Compute_0", utilPct: 90 },
      ],
    }), new Set([10]));
    expect(usage!.externalUtilPct).toBe(95);
  });

  it("reports NaN utilisation until the rate counter has an interval", () => {
    const [usage] = usageFromCounters([rtx5090], counters({
      engines: [{ pid: 99, luid: rtx5090.luid, engineType: "3D", utilPct: Number.NaN }],
    }), new Set());
    expect(usage!.externalUtilPct).toBeNaN();
  });
});
