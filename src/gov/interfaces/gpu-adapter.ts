import type { AdapterKind } from "./adapter-kind.ts";
import type { GpuVendor } from "./gpu-vendor.ts";

/** A physical GPU the governor tracks; static for the lifetime of the process. */
export interface GpuAdapter {
  luid: string;
  name: string;
  vendor: GpuVendor;
  vendorId: number;
  deviceId: number;
  kind: AdapterKind;
  /** Discrete: VRAM size. UMA: the carve-out reserved from system RAM. */
  deviceLocalBytes: number;
  sharedSystemBytes: number;
}
