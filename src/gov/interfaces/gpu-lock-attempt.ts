import type { GpuLockOwner } from "./gpu-lock-owner.ts";

export type GpuLockAttempt =
  | { acquired: true; release: () => void }
  | { acquired: false; owner: GpuLockOwner | null };
