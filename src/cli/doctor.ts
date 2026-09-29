// Read-only resource report in Chinese. Never loads a model or touches GPU memory.
// usage: bun run doctor [--seconds N] [--json]
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { formatGb } from "../core/units.ts";
import { hostHeadroomBytes } from "../gov/headroom.ts";
import { readGpuLockOwner } from "../gov/gpu-lock.ts";
import { adapterKindZh, lightReasonZh, lightZh } from "../gov/messages-zh.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor, defaultMonitorOptions } from "../gov/resource-monitor.ts";
import { fitTiers, recommendTier } from "../gov/tiers.ts";
import { readModelsLock } from "../models/lock.ts";
import { ortNativeDirectory, ortPackageVersion, requiredOrtVersion, systemOnnxRuntimeDll } from "../ort/runtime-files.ts";

const args = process.argv.slice(2);
const secondsIndex = args.indexOf("--seconds");
const seconds = secondsIndex >= 0 ? Number(args[secondsIndex + 1]) : 5;
if (!Number.isInteger(seconds) || seconds < 2) {
  throw new Error("--seconds needs an integer >= 2 (utilisation needs two samples)");
}
const asJson = args.includes("--json");

const paths = dataPaths(resolveDataRoot());
const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe, defaultMonitorOptions);
// Nothing is loaded; judge every supported adapter as if our models were on it.
for (const adapter of probe.adapters) {
  if (adapter.kind !== "unsupported") monitor.activeLuids.add(adapter.luid);
}
for (let second = 0; second < seconds; second += 1) {
  monitor.tick();
  if (second + 1 < seconds) {
    await Bun.sleep(defaultMonitorOptions.intervalMs);
  }
}
probe.close();

const state = monitor.latest!;
const host = state.sample.host;
const hostAvailableBytes = Math.max(0, host.availPhysBytes - hostHeadroomBytes(host.totalPhysBytes));
const lock = readModelsLock();
const adapters = probe.adapters.map((adapter) => {
  const usage = state.sample.adapters.find((candidate) => candidate.luid === adapter.luid)!;
  const budget = state.budgets.get(adapter.luid)!;
  const tiers = adapter.kind === "unsupported" ? [] : fitTiers(lock, adapter.kind, budget.availableBytes, hostAvailableBytes);
  return { adapter, usage, budget, tiers, recommended: recommendTier(tiers) };
});
const cpuOnly = fitTiers(lock, "unsupported", 0, hostAvailableBytes);
const report = {
  dataRoot: paths.root,
  sampledSeconds: seconds,
  adapters,
  host: { ...host, headroomBytes: hostHeadroomBytes(host.totalPhysBytes), availableForLoadsBytes: hostAvailableBytes },
  light: state.assessment,
  cpuFallback: recommendTier(cpuOnly),
  onnxRuntime: { version: ortPackageVersion(), required: requiredOrtVersion, nativeDirectory: ortNativeDirectory(), systemDll: systemOnnxRuntimeDll() },
  gpuLockOwner: readGpuLockOwner(paths),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const fitZh = { resident: "可与视觉模型同时常驻", timeshare: "只能与视觉模型分时", no: "装不下" } as const;
const lines: string[] = [];
lines.push("Comic Translator 资源体检（只读，不加载任何模型）");
lines.push(`数据目录：${report.dataRoot}`);
lines.push(`采样 ${seconds} 秒`);
lines.push("");
lines.push("显卡：");
if (adapters.length === 0) {
  lines.push("  未检测到可用显卡，视觉与翻译都走 CPU");
}
for (const { adapter, usage, budget, tiers, recommended } of adapters) {
  lines.push(`  ${adapter.name} · ${adapterKindZh[adapter.kind]} · 显存 ${formatGb(adapter.deviceLocalBytes)}`);
  if (adapter.kind === "unsupported") {
    continue;
  }
  const util = Number.isNaN(usage.externalUtilPct) ? "未知" : `${usage.externalUtilPct.toFixed(0)}%`;
  lines.push(`    全系统已用 ${formatGb(usage.dedicatedUsedBytes)}，其中本程序 ${formatGb(usage.ownDedicatedBytes)}；其他程序峰值 ${formatGb(budget.externalPeakBytes)}，GPU 占用 ${util}`);
  lines.push(`    给其他程序预留 ${formatGb(budget.headroomBytes)} → 本程序还可使用 ${formatGb(budget.availableBytes)}`);
  for (const fit of tiers.filter((candidate) => candidate.tier.device === "gpu")) {
    lines.push(`    ${fit.tier.id.padEnd(6)}${fit.tier.label.padEnd(24)} 约 ${formatGb(fit.devBytes)}  ${fitZh[fit.fit]}（估算，未实测）`);
  }
  const recommendation = !recommended ? "无" : recommended.tier.device === "cpu" ? `${recommended.tier.label}，显卡装不下任何档位` : `${recommended.tier.id} ${recommended.tier.label}（${fitZh[recommended.fit]}）`;
  lines.push(`    推荐：${recommendation}`);
}
lines.push("");
lines.push(`内存：可见 ${formatGb(host.totalPhysBytes)}，可用 ${formatGb(host.availPhysBytes)}，预留 ${formatGb(report.host.headroomBytes)} → 可用于加载 ${formatGb(hostAvailableBytes)}`);
lines.push(`虚拟内存（提交量）：上限 ${formatGb(host.commitLimitBytes)}，可用 ${formatGb(host.commitAvailBytes)}`);
lines.push(`仅 CPU 时：${report.cpuFallback ? `${report.cpuFallback.tier.label} 装得下` : "内存不足以运行 CPU 翻译档"}`);
lines.push("");
lines.push(`状态灯：${lightZh[state.assessment.light]}`);
for (const reason of state.assessment.reasons) {
  lines.push(`  - ${lightReasonZh[reason]}`);
}
lines.push("");
const ort = report.onnxRuntime;
lines.push(`ONNX Runtime：onnxruntime-node ${ort.version}${ort.version === ort.required ? "" : `（需要 ${ort.required}！）`}，随包原生库在 ${ort.nativeDirectory}`);
if (ort.systemDll) {
  lines.push(`  注意：系统目录存在 ${ort.systemDll}（Windows ML 自带旧版），工作进程会先按绝对路径预加载随包版本`);
}
lines.push(`GPU 锁：${report.gpuLockOwner ? `被 PID ${report.gpuLockOwner.pid}（${report.gpuLockOwner.purpose}）持有，自 ${report.gpuLockOwner.acquiredAt}` : "空闲"}`);
console.log(lines.join("\n"));
