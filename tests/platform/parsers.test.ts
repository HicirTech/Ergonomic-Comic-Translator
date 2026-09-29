import { describe, expect, it } from "bun:test";
import { parseMeminfo } from "../../src/platform/linux/meminfo.ts";
import { parseGpuCounterInstance } from "../../src/platform/win32/gpu-counter-instance.ts";

describe("parseGpuCounterInstance", () => {
  it("parses adapter, process and engine instance names", () => {
    expect(parseGpuCounterInstance("luid_0x00000000_0x00018555_phys_0"))
      .toEqual({ pid: null, luid: "0x00000000_0x00018555", engineType: null });
    expect(parseGpuCounterInstance("pid_10212_luid_0x00000000_0x00018555_phys_0"))
      .toEqual({ pid: 10212, luid: "0x00000000_0x00018555", engineType: null });
    expect(parseGpuCounterInstance("pid_4_luid_0x00000000_0x0001A2CB_phys_0_eng_3_engtype_Compute_0"))
      .toEqual({ pid: 4, luid: "0x00000000_0x0001a2cb", engineType: "Compute_0" });
  });

  it("rejects unrelated names", () => {
    expect(parseGpuCounterInstance("_Total")).toBeNull();
  });
});

describe("parseMeminfo", () => {
  it("converts kB values to bytes", () => {
    const info = parseMeminfo("MemTotal:       32768000 kB\nMemAvailable:   16000000 kB\nActive(anon):     1000 kB\nHugePages_Total:       0\n");
    expect(info.get("MemTotal")).toBe(32768000 * 1024);
    expect(info.get("Active(anon)")).toBe(1000 * 1024);
    expect(info.get("HugePages_Total")).toBe(0);
  });
});
