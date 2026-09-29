import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { dataPaths } from "../../src/core/data-paths.ts";
import { GiB, MiB } from "../../src/core/units.ts";
import type { GpuAdapter, ResourceProbe } from "../../src/gov/interfaces/index.ts";
import { ResourceMonitor } from "../../src/gov/resource-monitor.ts";
import { acquireGpuLock, supportedAdaptersByBudget, watchRedLight } from "../../src/sessions/gpu-access.ts";
import { host, radeon780m, rtx5090, sample, usage } from "../gov/fixtures.ts";

const intelArc: GpuAdapter = { ...rtx5090, luid: "0x00000000_0x00000042", name: "Intel Arc", vendor: "intel", vendorId: 0x8086, kind: "unsupported" };

/** A probe whose host memory the test can change between ticks. */
const fakeProbe = (availPhysBytes: { value: number }): ResourceProbe => ({
  adapters: [radeon780m, intelArc, rtx5090],
  sample: () => sample(
    [usage(radeon780m), usage(intelArc), usage(rtx5090, { dedicatedUsedBytes: 4 * GiB })],
    host({ availPhysBytes: availPhysBytes.value }),
  ),
  close: () => {},
});

describe("supportedAdaptersByBudget", () => {
  it("drops unsupported adapters and puts the one with the most room first", () => {
    const ranked = supportedAdaptersByBudget(new ResourceMonitor(fakeProbe({ value: 18 * GiB })));
    expect(ranked.map((entry) => entry.adapter.name)).toEqual([rtx5090.name, radeon780m.name]);
    expect(ranked[0]!.availableBytes).toBeGreaterThan(ranked[1]!.availableBytes);
  });
});

describe("watchRedLight", () => {
  it("aborts once with Chinese reasons when host memory runs out, and stops after unsubscribe", () => {
    const memory = { value: 18 * GiB };
    const monitor = new ResourceMonitor(fakeProbe(memory));
    let calls = 0;
    const red = watchRedLight(monitor, () => {
      calls += 1;
    });
    monitor.tick();
    expect(red.signal.aborted).toBe(false);
    memory.value = 200 * MiB;
    monitor.tick();
    monitor.tick();
    expect(calls).toBe(1);
    expect(red.signal.aborted).toBe(true);
    expect(String(red.signal.reason)).toContain("内存");

    const later = watchRedLight(monitor, () => {
      calls += 1;
    });
    later.unsubscribe();
    monitor.tick();
    expect(later.signal.aborted).toBe(false);
  });
});

describe("acquireGpuLock", () => {
  it("names the holder when the lock is taken", () => {
    const root = mkdtempSync(join(tmpdir(), "ct-access-"));
    try {
      const first = acquireGpuLock(dataPaths(root), "vision job");
      expect(first.ok).toBe(true);
      const second = acquireGpuLock(dataPaths(root), "translate job");
      expect(second).toEqual({ ok: false, failure: { kind: "busy", messageZh: `显卡正被占用：PID ${process.pid}（vision job）` } });
      if (first.ok) first.release();
      const third = acquireGpuLock(dataPaths(root), "translate job");
      expect(third.ok).toBe(true);
      if (third.ok) third.release();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
