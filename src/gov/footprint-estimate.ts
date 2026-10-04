import { GiB } from "../core/units.ts";

/**
 * Pre-measurement footprint estimates. Admission prefers measured values from the footprint table;
 * these only cover the first run on a machine. KV for Qwen3.5 hybrid attention at 8k context is small.
 */
const kvCacheBytes = 0.4 * GiB;
const computeBufferBytes = 0.5 * GiB;
/** Runtime overhead measured once under CUDA (23.7 GB total vs 22.5 GB itemised); Vulkan is unmeasured. */
const runtimeOverheadBytes = 1.2 * GiB;
const safetyFactor = 1.1;
/** llama-server private memory with mmap disabled; hypothesis until the E-load experiment measures it. */
const llmHostPrivateBytes = 2 * GiB;
/** Extra RAM a CPU-only LLM needs beyond its weights. */
const cpuLlmExtraBytes = 2 * GiB;

/** All vision sessions together; they took 1.8 GB on an RTX 5090 with LaMa on WebGPU. */
export const visionResidentBytes = 2 * GiB;

export const estimateGpuLlm = (weightsBytes: number) => ({
  devBytes: (weightsBytes + kvCacheBytes + computeBufferBytes + runtimeOverheadBytes) * safetyFactor,
  hostPrivateBytes: llmHostPrivateBytes,
});

export const estimateCpuLlm = (weightsBytes: number) => ({
  devBytes: 0,
  hostPrivateBytes: weightsBytes + cpuLlmExtraBytes,
});
