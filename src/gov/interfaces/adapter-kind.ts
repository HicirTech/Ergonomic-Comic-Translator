/**
 * How the governor budgets an adapter:
 * - discrete: dedicated VRAM, spilling into shared memory is forbidden;
 * - uma: integrated GPU whose "dedicated" memory is a carve-out of system RAM;
 * - unsupported: excluded (software adapters and Intel GPUs); work falls back to the CPU.
 */
export type AdapterKind = "discrete" | "uma" | "unsupported";
