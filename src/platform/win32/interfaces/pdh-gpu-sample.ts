/** One collection of the WDDM GPU performance counters, grouped by adapter LUID. */
export interface PdhGpuSample {
  /** System-wide usage per adapter LUID. */
  adapters: Map<string, { dedicatedBytes: number; sharedBytes: number }>;
  processes: { pid: number; luid: string; dedicatedBytes: number; sharedBytes: number }[];
  /** Per process, adapter and engine; NaN until a second collection gives the rate counter an interval. */
  engines: { pid: number; luid: string; engineType: string; utilPct: number }[];
}
