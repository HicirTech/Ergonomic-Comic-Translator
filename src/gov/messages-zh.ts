import type { AdapterKind, AdmissionReason, Light, LightReason } from "./interfaces/index.ts";

/** User-facing Chinese text for governor states; users never see codes or the source language. */
export const admissionReasonZh: Record<AdmissionReason, string> = {
  adapter_unknown: "找不到这块显卡",
  adapter_unsupported: "这块显卡不在支持范围内，改用 CPU",
  device_memory_short: "显存不够：要给其他程序留出余量",
  spill_forbidden: "独显不允许把显存溢出到内存",
  spill_over_limit: "核显共享内存超出允许的缓冲",
  host_memory_short: "内存不够：要给系统和其他程序留出余量",
  commit_short: "虚拟内存（提交量）余量不足 4 GB",
};

export const lightReasonZh: Record<LightReason, string> = {
  device_free_low: "显存余量低于预留值，暂停派发新任务",
  device_free_critical: "显存即将耗尽，正在卸载模型",
  carve_out_high: "核显显存接近上限，暂停派发新任务",
  carve_out_critical: "核显显存即将耗尽，正在卸载模型",
  host_memory_low: "可用内存低于预留值，暂停派发新任务",
  host_memory_critical: "可用内存即将耗尽，正在卸载模型",
  commit_low: "虚拟内存余量低于 4 GB，暂停派发新任务",
  commit_critical: "虚拟内存余量低于 2 GB，正在卸载模型",
  shared_spill: "检测到显存溢出到内存，正在卸载模型",
  throughput_cliff: "翻译速度骤降（疑似显存溢出），正在卸载模型",
  throughput_cliff_unconfirmed: "翻译速度下降，可能是笔记本功耗限制，继续观察",
  slow_vision_runs: "图像处理连续变慢，正在释放显卡",
  device_reset: "显卡驱动重置过，稍后以更保守的方式继续",
};

export const lightZh: Record<Light, string> = {
  green: "正常",
  yellow: "黄灯：暂停派发新任务",
  red: "红灯：中止并卸载",
};

export const adapterKindZh: Record<AdapterKind, string> = {
  discrete: "独显",
  uma: "核显（显存从内存划出）",
  unsupported: "不支持，改用 CPU",
};
