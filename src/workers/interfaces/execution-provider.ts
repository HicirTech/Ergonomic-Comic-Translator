/** Where a vision model runs. DirectML is bound to one adapter by LUID; WebGPU picks its own adapter. */
export type ExecutionProvider =
  | { name: "cpu" }
  | { name: "dml"; adapterLuid: string }
  | { name: "webgpu" };
