export type LightReason =
  | "device_free_low"
  | "device_free_critical"
  | "carve_out_high"
  | "carve_out_critical"
  | "host_memory_low"
  | "host_memory_critical"
  | "commit_low"
  | "commit_critical"
  | "shared_spill"
  | "throughput_cliff"
  | "throughput_cliff_unconfirmed"
  | "slow_vision_runs"
  | "device_reset";
