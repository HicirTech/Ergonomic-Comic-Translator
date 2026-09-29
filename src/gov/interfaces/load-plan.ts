/** Memory a model load is expected to take, split by pool. Measured footprints replace estimates when available. */
export interface LoadPlan {
  label: string;
  /** Target adapter; null for a CPU-only load. */
  adapterLuid: string | null;
  /** Resident in the device-local pool (VRAM or UMA carve-out). */
  devBytes: number;
  /** Expected in shared, host-backed GPU memory. Must be 0 on discrete GPUs. */
  spillBytes: number;
  /** Private memory of the process in system RAM. */
  hostPrivateBytes: number;
  /** Commit charge; defaults to hostPrivateBytes + spillBytes. */
  commitBytes?: number;
}
