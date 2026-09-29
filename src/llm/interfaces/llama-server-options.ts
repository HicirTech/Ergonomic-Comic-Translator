/** Launch settings for one llama-server process; the launch template fills in everything else. */
export interface LlamaServerOptions {
  /** Absolute path of llama-server(.exe) from the pinned runtime. */
  executable: string;
  modelPath: string;
  /** llama.cpp device name ("Vulkan0", "CUDA0") or "none" for CPU only. */
  device: string;
  /** Context per slot in tokens. */
  contextPerSlot: number;
  parallel: number;
  threads: number;
  port: number;
  apiKey: string;
  chatTemplateFile: string | null;
}
