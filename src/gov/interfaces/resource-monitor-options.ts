export interface ResourceMonitorOptions {
  intervalMs: number;
  /** Window for the external usage peak that admission subtracts. */
  peakWindowMs: number;
  /** External engine load above this percentage counts towards yielding. */
  yieldUtilPct: number;
  yieldHoldMs: number;
}
