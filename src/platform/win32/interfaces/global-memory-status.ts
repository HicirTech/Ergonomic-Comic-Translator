export interface GlobalMemoryStatus {
  totalPhysBytes: number;
  availPhysBytes: number;
  /** Commit limit (RAM + page files). */
  commitLimitBytes: number;
  /** Commit charge still available before the commit limit. */
  commitAvailBytes: number;
}
