import { describe, expect, it } from "bun:test";
import { GiB } from "../../src/core/units.ts";
import { fitTiers, recommendTier } from "../../src/gov/tiers.ts";
import { readModelsLock } from "../../src/models/lock.ts";

const lock = readModelsLock();
const recommend = (...args: Parameters<typeof fitTiers> extends [unknown, ...infer Rest] ? Rest : never) =>
  recommendTier(fitTiers(lock, ...args));

describe("tier recommendation (estimates)", () => {
  it("keeps T2 resident with vision on the shared 5090", () => {
    expect(recommend("discrete", 17.3 * GiB, 9 * GiB)).toMatchObject({ tier: { id: "T2" }, fit: "resident" });
  });

  it("steps down to T1 on a 12 GB card", () => {
    // 12 GiB card: 12 - 1 desktop - 2.4 headroom = 8.6 GiB available
    expect(recommend("discrete", 8.6 * GiB, 9 * GiB)).toMatchObject({ tier: { id: "T1" }, fit: "timeshare" });
  });

  it("falls back to the CPU tier when no GPU tier fits", () => {
    expect(recommend("uma", 6.25 * GiB, 10 * GiB)).toMatchObject({ tier: { id: "C0", device: "cpu" } });
  });

  it("prefers Hy-MT2-7B on a UMA carve-out that fits it", () => {
    expect(recommend("uma", 10 * GiB, 10 * GiB)).toMatchObject({ tier: { id: "iG-8" }, fit: "resident" });
  });

  it("recommends nothing when RAM cannot hold even the CPU tier", () => {
    expect(recommend("discrete", 0, 3 * GiB)).toBeNull();
  });
});
