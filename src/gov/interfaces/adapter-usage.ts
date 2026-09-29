/** Memory and engine load of one adapter at one sampling instant. */
export interface AdapterUsage {
  luid: string;
  /** System-wide device-local usage (all processes). */
  dedicatedUsedBytes: number;
  /** System-wide shared (host-backed) GPU memory usage. */
  sharedUsedBytes: number;
  /** Device-local usage of our own processes. */
  ownDedicatedBytes: number;
  ownSharedBytes: number;
  /** Busiest engine type summed over other processes, 0..100; NaN before the rate counter has an interval. */
  externalUtilPct: number;
}
