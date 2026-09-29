import { describe, expect, it } from "bun:test";
import { GiB, MiB } from "../../src/core/units.ts";
import { assessLights } from "../../src/gov/lights.ts";
import { host, quietSignals, radeon780m, rtx5090, sample, usage } from "./fixtures.ts";

const active5090 = new Set([rtx5090.luid]);
const activeIgpu = new Set([radeon780m.luid]);
const vram = rtx5090.deviceLocalBytes;

describe("assessLights on a discrete GPU", () => {
  it("is green with enough free VRAM, RAM and commit", () => {
    const state = assessLights([rtx5090], sample([usage(rtx5090, { dedicatedUsedBytes: 20 * GiB })]), quietSignals(), active5090);
    expect(state).toEqual({ light: "green", reasons: [] });
  });

  it("turns yellow below the VRAM headroom and red below half of it", () => {
    const yellow = assessLights([rtx5090], sample([usage(rtx5090, { dedicatedUsedBytes: vram - 5 * GiB })]), quietSignals(), active5090);
    expect(yellow).toEqual({ light: "yellow", reasons: ["device_free_low"] });
    const red = assessLights([rtx5090], sample([usage(rtx5090, { dedicatedUsedBytes: vram - 2 * GiB })]), quietSignals(), active5090);
    expect(red).toEqual({ light: "red", reasons: ["device_free_critical"] });
  });

  it("ignores pressure on adapters that hold none of our models", () => {
    const state = assessLights([rtx5090], sample([usage(rtx5090, { dedicatedUsedBytes: vram })]), quietSignals(), new Set());
    expect(state.light).toBe("green");
  });

  it("reads shared-memory growth as a spill only when the card is also nearly full", () => {
    const signals = quietSignals({ ownSharedBaselineBytes: new Map([[rtx5090.luid, 100 * MiB]]) });
    const grown = (dedicatedUsedBytes: number) =>
      sample([usage(rtx5090, { dedicatedUsedBytes, ownSharedBytes: 600 * MiB })]);
    expect(assessLights([rtx5090], grown(20 * GiB), signals, active5090).reasons).toEqual([]);
    expect(assessLights([rtx5090], grown(vram - 512 * MiB), signals, active5090).reasons).toContain("shared_spill");
  });

  it("goes red on RAM, commit, throughput and device-reset signals", () => {
    const busy = sample([usage(rtx5090)], host({ availPhysBytes: 3 * GiB, commitAvailBytes: 1.5 * GiB }));
    const state = assessLights([rtx5090], busy, quietSignals({ throughputCliff: true, deviceReset: true, slowVisionRuns: true }), active5090);
    expect(state.light).toBe("red");
    expect(state.reasons).toEqual(expect.arrayContaining([
      "host_memory_critical", "commit_critical", "throughput_cliff", "slow_vision_runs", "device_reset",
    ]));
  });

  it("turns yellow when RAM or commit only dip below their headroom", () => {
    const state = assessLights([rtx5090], sample([usage(rtx5090)], host({ availPhysBytes: 6 * GiB, commitAvailBytes: 3 * GiB })), quietSignals(), active5090);
    expect(state).toEqual({ light: "yellow", reasons: ["host_memory_low", "commit_low"] });
  });
});

describe("assessLights on a UMA carve-out", () => {
  const umaHost = host({ totalPhysBytes: 24 * GiB, availPhysBytes: 14 * GiB, installedBytes: 32 * GiB });

  it("watches the carve-out fill level", () => {
    const high = assessLights([radeon780m], sample([usage(radeon780m, { dedicatedUsedBytes: 7.2 * GiB })], umaHost), quietSignals(), activeIgpu);
    expect(high).toEqual({ light: "yellow", reasons: ["carve_out_high"] });
    const critical = assessLights([radeon780m], sample([usage(radeon780m, { dedicatedUsedBytes: 7.8 * GiB })], umaHost), quietSignals(), activeIgpu);
    expect(critical).toEqual({ light: "red", reasons: ["carve_out_critical"] });
  });

  it("treats a speed cliff with steady memory as throttling (yellow), and with memory pressure as red", () => {
    const steady = assessLights([radeon780m], sample([usage(radeon780m, { dedicatedUsedBytes: 5 * GiB })], umaHost), quietSignals({ throughputCliff: true }), activeIgpu);
    expect(steady).toEqual({ light: "yellow", reasons: ["throughput_cliff_unconfirmed"] });
    const pressured = assessLights([radeon780m], sample([usage(radeon780m, { dedicatedUsedBytes: 7.2 * GiB })], umaHost), quietSignals({ throughputCliff: true }), activeIgpu);
    expect(pressured.light).toBe("red");
    expect(pressured.reasons).toContain("throughput_cliff");
  });

  it("needs falling RAM to confirm a shared-memory spill", () => {
    const grown = sample([usage(radeon780m, { dedicatedUsedBytes: 5 * GiB, ownSharedBytes: 2 * GiB })], umaHost);
    const baseline = new Map([[radeon780m.luid, 512 * MiB]]);
    expect(assessLights([radeon780m], grown, quietSignals({ ownSharedBaselineBytes: baseline, availPhysTenSecondsAgoBytes: 14 * GiB }), activeIgpu).reasons)
      .toEqual([]);
    expect(assessLights([radeon780m], grown, quietSignals({ ownSharedBaselineBytes: baseline, availPhysTenSecondsAgoBytes: 15 * GiB }), activeIgpu).reasons)
      .toEqual(["shared_spill"]);
  });
});
