import type { GpuCounterInstance } from "./interfaces/index.ts";

const instancePattern = /^(?:pid_(\d+)_)?luid_(0x[0-9a-f]+_0x[0-9a-f]+)_phys_\d+(?:_eng_\d+_engtype_(.*))?$/i;

/** Parses a "GPU Adapter Memory", "GPU Process Memory" or "GPU Engine" instance name; null when it does not match. */
export const parseGpuCounterInstance = (name: string): GpuCounterInstance | null => {
  const match = instancePattern.exec(name);
  if (!match) {
    return null;
  }
  return {
    pid: match[1] ? Number(match[1]) : null,
    luid: match[2]!.toLowerCase(),
    engineType: match[3] ?? null,
  };
};
