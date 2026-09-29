import { describe, expect, it } from "bun:test";
import { GiB, MiB } from "../../src/core/units.ts";
import { admit } from "../../src/gov/admission.ts";
import { deviceBudget } from "../../src/gov/budget.ts";
import { discreteHeadroomBytes, hostHeadroomBytes, umaHeadroomBytes } from "../../src/gov/headroom.ts";
import type { GpuAdapter, LoadPlan } from "../../src/gov/interfaces/index.ts";
import { host, radeon780m, rtx5090, usage } from "./fixtures.ts";

const budgetsFor = (adapter: GpuAdapter, externalPeakBytes: number, ownBytes = 0) =>
  new Map([[adapter.luid, deviceBudget(adapter, usage(adapter, { dedicatedUsedBytes: externalPeakBytes + ownBytes, ownDedicatedBytes: ownBytes }), externalPeakBytes)]]);

const plan = (overrides: Partial<LoadPlan>): LoadPlan => ({
  label: "test",
  adapterLuid: rtx5090.luid,
  devBytes: 0,
  spillBytes: 0,
  hostPrivateBytes: 0,
  ...overrides,
});

describe("headroom formulas", () => {
  it("keep 20 % of discrete VRAM within 1.5-6 GiB", () => {
    expect(discreteHeadroomBytes(8 * GiB)).toBeCloseTo(1.6 * GiB, -3);
    expect(discreteHeadroomBytes(4 * GiB)).toBe(1.5 * GiB);
    expect(discreteHeadroomBytes(rtx5090.deviceLocalBytes)).toBe(6 * GiB);
  });

  it("keep at least 1 GiB of a UMA carve-out", () => {
    expect(umaHeadroomBytes(8 * GiB)).toBe(GiB);
    expect(umaHeadroomBytes(12 * GiB)).toBe(1.5 * GiB);
  });

  it("keep 30 % of RAM within 4-8 GiB", () => {
    expect(hostHeadroomBytes(31653 * MiB)).toBe(8 * GiB);
    expect(hostHeadroomBytes(16 * GiB)).toBeCloseTo(4.8 * GiB, -3);
    expect(hostHeadroomBytes(8 * GiB)).toBe(4 * GiB);
  });
});

describe("admit", () => {
  it("refuses the 2026-09-29 incident load (23.7 GB model, 6845 MiB external, 8.7 GiB RAM free)", () => {
    const decision = admit(
      plan({ label: "qwen3.6-35b-a3b q4", devBytes: 23.7 * GiB, hostPrivateBytes: 1.5 * GiB }),
      [rtx5090],
      budgetsFor(rtx5090, 6845 * MiB),
      host({ availPhysBytes: 8.7 * GiB }),
    );
    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain("device_memory_short");
    expect(decision.reasons).toContain("host_memory_short");
  });

  it("admits the default T2 tier next to the owner's usual external load", () => {
    const decision = admit(
      plan({ label: "qwen3.5-9b q6_k", devBytes: 10 * GiB, hostPrivateBytes: 1.5 * GiB }),
      [rtx5090],
      budgetsFor(rtx5090, 8.1 * GiB, 1.5 * GiB),
      host(),
    );
    expect(decision.reasons).toEqual([]);
    expect(decision.admitted).toBe(true);
    // 31.4 GiB - 8.1 external - 6 headroom - 1.5 own vision
    expect(decision.budget!.availableBytes).toBeCloseTo(rtx5090.deviceLocalBytes - 15.6 * GiB, -3);
  });

  it("forbids spilling into shared memory on a discrete GPU", () => {
    const decision = admit(plan({ devBytes: GiB, spillBytes: MiB }), [rtx5090], budgetsFor(rtx5090, 0), host());
    expect(decision.reasons).toEqual(["spill_forbidden"]);
  });

  it("allows a small transient spill on a UMA carve-out but not more", () => {
    const umaPlan = (spillBytes: number) => plan({ adapterLuid: radeon780m.luid, devBytes: 5 * GiB, spillBytes });
    const budgets = budgetsFor(radeon780m, 0.75 * GiB);
    const uma = host({ totalPhysBytes: 24 * GiB, availPhysBytes: 18 * GiB, installedBytes: 32 * GiB });
    expect(admit(umaPlan(256 * MiB), [radeon780m], budgets, uma).admitted).toBe(true);
    expect(admit(umaPlan(GiB), [radeon780m], budgets, uma).reasons).toEqual(["spill_over_limit"]);
  });

  it("does not fit Qwen3.5-9B Q4_K_M on an 8 GiB carve-out by estimate", () => {
    // 8 GiB - 0.75 GiB desktop - 1 GiB headroom = 6.25 GiB available; estimate for 9B Q4_K_M is about 7 GiB
    const decision = admit(
      plan({ adapterLuid: radeon780m.luid, devBytes: 7 * GiB, hostPrivateBytes: GiB }),
      [radeon780m],
      budgetsFor(radeon780m, 0.75 * GiB),
      host({ totalPhysBytes: 24 * GiB, availPhysBytes: 18 * GiB }),
    );
    expect(decision.reasons).toEqual(["device_memory_short"]);
  });

  it("requires 4 GiB of commit to remain after the load", () => {
    const decision = admit(plan({ adapterLuid: null, hostPrivateBytes: 6 * GiB }), [], new Map(), host({ commitAvailBytes: 9 * GiB }));
    expect(decision.reasons).toEqual(["commit_short"]);
    expect(decision.commitAfterBytes).toBe(3 * GiB);
  });

  it("refuses loads on unsupported or unknown adapters", () => {
    const intel: GpuAdapter = { ...rtx5090, luid: "0x0_0x1", vendor: "intel", vendorId: 0x8086, kind: "unsupported" };
    expect(admit(plan({ adapterLuid: intel.luid, devBytes: GiB }), [intel], budgetsFor(intel, 0), host()).reasons)
      .toEqual(["adapter_unsupported"]);
    expect(admit(plan({ adapterLuid: "0x0_0xdead", devBytes: GiB }), [rtx5090], new Map(), host()).reasons)
      .toEqual(["adapter_unknown"]);
  });
});
