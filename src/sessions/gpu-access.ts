import type { DataPaths } from "../core/data-paths.ts";
import { tryAcquireGpuLock } from "../gov/gpu-lock.ts";
import type { AdmissionDecision } from "../gov/interfaces/index.ts";
import { admissionReasonZh, lightReasonZh } from "../gov/messages-zh.ts";
import type { ResourceMonitor } from "../gov/resource-monitor.ts";
import type { SessionFailure } from "./interfaces/index.ts";

/** Supported adapters with the device memory a load may take now, most first. */
export const supportedAdaptersByBudget = (monitor: ResourceMonitor) => {
  const state = monitor.latest ?? monitor.tick();
  return monitor.adapters
    .filter((adapter) => adapter.kind !== "unsupported")
    .map((adapter) => ({ adapter, availableBytes: state.budgets.get(adapter.luid)?.availableBytes ?? 0 }))
    .sort((a, b) => b.availableBytes - a.availableBytes);
};

export const deniedFailure = (decision: AdmissionDecision): SessionFailure => ({
  kind: "denied",
  messageZh: `资源不足，未加载模型：${decision.reasons.map((reason) => admissionReasonZh[reason]).join("；")}`,
});

/** Takes the machine-wide GPU lock, or explains who holds it. */
export const acquireGpuLock = (paths: DataPaths, purpose: string) => {
  const lock = tryAcquireGpuLock(paths, purpose);
  if (lock.acquired) {
    return { ok: true as const, release: lock.release };
  }
  const failure: SessionFailure = {
    kind: "busy",
    messageZh: `显卡正被占用：${lock.owner ? `PID ${lock.owner.pid}（${lock.owner.purpose}）` : "另一个进程"}`,
  };
  return { ok: false as const, failure };
};

/**
 * Calls `onRed` once when the governor turns red. The returned signal aborts at that moment with the
 * Chinese reasons as its reason.
 */
export const watchRedLight = (monitor: ResourceMonitor, onRed: () => void) => {
  const abort = new AbortController();
  const unsubscribe = monitor.onState((state) => {
    if (state.assessment.light === "red" && !abort.signal.aborted) {
      abort.abort(state.assessment.reasons.map((reason) => lightReasonZh[reason]).join("；"));
      onRed();
    }
  });
  return { signal: abort.signal, unsubscribe };
};
