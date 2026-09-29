import { processAnonymousBytes, readMeminfo } from "../platform/linux/meminfo.ts";
import { enumerateDxgiAdapters } from "../platform/win32/dxgi.ts";
import {
  globalMemoryStatus,
  physicallyInstalledMemoryBytes,
  processPrivateBytes,
} from "../platform/win32/kernel32.ts";
import { openGpuCounterQuery } from "../platform/win32/pdh.ts";
import { selectAdapters } from "./adapters.ts";
import type { HostMemory, ResourceProbe } from "./interfaces/index.ts";
import { usageFromCounters } from "./usage-from-counters.ts";

const sumOwn = (ownPids: ReadonlySet<number>, read: (pid: number) => number | null) => {
  let total = 0;
  for (const pid of ownPids) {
    total += read(pid) ?? 0;
  }
  return total;
};

const openWin32Probe = (): ResourceProbe => {
  const query = openGpuCounterQuery();
  const first = query.collect();
  const memory = globalMemoryStatus();
  const installedBytes = physicallyInstalledMemoryBytes();
  const adapters = selectAdapters(enumerateDxgiAdapters(), new Set(first.adapters.keys()), memory.totalPhysBytes, installedBytes);

  return {
    adapters,
    sample: (ownPids) => {
      const counters = query.collect();
      const status = globalMemoryStatus();
      const host: HostMemory = { ...status, installedBytes, ownPrivateBytes: sumOwn(ownPids, processPrivateBytes) };
      return { takenAtMs: Date.now(), adapters: usageFromCounters(adapters, counters, ownPids), host };
    },
    close: () => query.close(),
  };
};

/** Linux support is experimental: host memory only, no GPU probing, so every load is planned for the CPU. */
const openLinuxProbe = (): ResourceProbe => ({
  adapters: [],
  sample: (ownPids) => {
    const info = readMeminfo();
    const read = (key: string) => info.get(key) ?? 0;
    const host: HostMemory = {
      totalPhysBytes: read("MemTotal"),
      availPhysBytes: read("MemAvailable"),
      // Linux overcommits by default, so "commit" here is what can still be backed by RAM or swap.
      commitLimitBytes: read("MemTotal") + read("SwapTotal"),
      commitAvailBytes: read("MemAvailable") + read("SwapFree"),
      installedBytes: null,
      ownPrivateBytes: sumOwn(ownPids, processAnonymousBytes),
    };
    return { takenAtMs: Date.now(), adapters: [], host };
  },
  close: () => {},
});

export const openResourceProbe = (): ResourceProbe => {
  if (process.platform === "win32") {
    return openWin32Probe();
  }
  if (process.platform === "linux") {
    return openLinuxProbe();
  }
  throw new Error(`Resource probing is not implemented for ${process.platform}`);
};
