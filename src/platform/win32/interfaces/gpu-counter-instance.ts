/** Parsed WDDM counter instance name, e.g. "pid_1234_luid_0x00000000_0x0000d1a9_phys_0_eng_3_engtype_3D". */
export interface GpuCounterInstance {
  pid: number | null;
  luid: string;
  engineType: string | null;
}
