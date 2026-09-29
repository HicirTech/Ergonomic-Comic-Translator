import type { AdapterKind } from "./adapter-kind.ts";

/** Device-local memory a new load may still take on one adapter. */
export interface DeviceBudget {
  luid: string;
  kind: AdapterKind;
  deviceLocalBytes: number;
  /** Peak usage of other processes over the observation window. */
  externalPeakBytes: number;
  headroomBytes: number;
  ownBytes: number;
  /** deviceLocal - externalPeak - headroom - own, never below 0. */
  availableBytes: number;
}
