/** Written next to the lock file by the holder so diagnostics can say who holds the GPU. */
export interface GpuLockOwner {
  pid: number;
  purpose: string;
  acquiredAt: string;
}
