import { GiB, MiB } from "../core/units.ts";
import type { GpuAdapter } from "./interfaces/index.ts";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Discrete VRAM kept free for other applications: 20 % of VRAM, at least 1.5 GiB, at most 6 GiB. */
export const discreteHeadroomBytes = (vramBytes: number) => clamp(0.2 * vramBytes, 1.5 * GiB, 6 * GiB);

/**
 * UMA carve-out kept free: 12.5 % of the carve-out, at least 1 GiB. Smaller than the discrete margin because
 * overflowing a carve-out lands in the same DRAM instead of crossing PCIe; the host pool guards RAM itself.
 */
export const umaHeadroomBytes = (carveOutBytes: number) => Math.max(GiB, 0.125 * carveOutBytes);

export const deviceHeadroomBytes = (adapter: GpuAdapter) =>
  adapter.kind === "uma" ? umaHeadroomBytes(adapter.deviceLocalBytes) : discreteHeadroomBytes(adapter.deviceLocalBytes);

/** RAM kept free for the rest of the system: 30 % of visible RAM, at least 4 GiB, at most 8 GiB. */
export const hostHeadroomBytes = (totalPhysBytes: number) => clamp(0.3 * totalPhysBytes, 4 * GiB, 8 * GiB);

/** Admission keeps this much commit available after a load; below it the light turns yellow. */
export const commitHeadroomBytes = 4 * GiB;
/** Below this much available commit the light turns red. */
export const commitCriticalBytes = 2 * GiB;

/** Transient shared buffers allowed on a UMA adapter (hypothesis until the E-gov-UMA calibration). */
export const umaSpillLimitBytes = 512 * MiB;
/** Red when a UMA carve-out is used beyond carve-out minus this margin. */
export const umaCarveOutCriticalMarginBytes = 512 * MiB;

/** Growth of our shared GPU memory that counts as a spill on a discrete GPU (auxiliary until calibrated). */
export const discreteSpillSignalBytes = 256 * MiB;
/** A discrete spill signal needs the adapter to be this close to full as confirmation. */
export const discreteNearFullBytes = GiB;
/** Growth of our shared GPU memory beyond plan that counts as a spill on a UMA adapter. */
export const umaSpillSignalBytes = GiB;
/** Drop in available RAM over about 10 s that confirms a UMA spill. */
export const umaAvailDropConfirmBytes = 256 * MiB;
