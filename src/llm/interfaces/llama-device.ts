/** One backend device as `llama-server --list-devices` prints it, e.g. "Vulkan0: NVIDIA GeForce RTX 5090 (32607 MiB, 30120 MiB free)". */
export interface LlamaDevice {
  name: string;
  description: string;
  totalMiB: number;
}
