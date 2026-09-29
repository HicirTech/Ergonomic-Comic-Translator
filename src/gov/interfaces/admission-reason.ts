export type AdmissionReason =
  | "adapter_unknown"
  | "adapter_unsupported"
  | "device_memory_short"
  | "spill_forbidden"
  | "spill_over_limit"
  | "host_memory_short"
  | "commit_short";
