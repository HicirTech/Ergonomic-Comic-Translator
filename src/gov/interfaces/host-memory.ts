/** System RAM and commit state at one sampling instant. */
export interface HostMemory {
  /** RAM visible to the OS (an iGPU carve-out is already subtracted). */
  totalPhysBytes: number;
  availPhysBytes: number;
  commitLimitBytes: number;
  commitAvailBytes: number;
  /** Installed RAM per firmware, including any iGPU carve-out; null when unknown. */
  installedBytes: number | null;
  /** Private commit of our own processes. */
  ownPrivateBytes: number;
}
