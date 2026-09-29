import { describe, expect, it } from "bun:test";
import { GiB } from "../../src/core/units.ts";
import { resourceStatus } from "../../src/server/resource-status.ts";
import { radeon780m, rtx5090, sample, usage } from "../gov/fixtures.ts";

describe("resourceStatus", () => {
  it("shows the light with Chinese reasons and the room left per usable adapter", () => {
    const status = resourceStatus({
      sample: sample([usage(radeon780m, { externalUtilPct: Number.NaN })]),
      budgets: new Map([[radeon780m.luid, { luid: radeon780m.luid, kind: "uma", deviceLocalBytes: 8 * GiB, externalPeakBytes: 0, headroomBytes: GiB, ownBytes: 0, availableBytes: 7 * GiB }]]),
      assessment: { light: "yellow", reasons: ["host_memory_low"] },
      yielding: false,
    }, [radeon780m, { ...rtx5090, kind: "unsupported" }], "llm");
    expect(status).toEqual({
      light: "yellow",
      lightZh: "黄灯：暂停派发新任务",
      reasonsZh: ["可用内存低于预留值，暂停派发新任务"],
      loaded: "llm",
      adapters: [{ name: "AMD Radeon 780M Graphics", kindZh: "核显（显存从内存划出）", totalBytes: 8 * GiB, availableBytes: 7 * GiB, externalUtilPct: null }],
    });
  });
});
