import { admit } from "./admission.ts";
import { deviceBudget, externalDedicatedBytes } from "./budget.ts";
import type {
  AdmissionDecision,
  DeviceBudget,
  LoadPlan,
  MonitorState,
  ResourceMonitorOptions,
  ResourceProbe,
} from "./interfaces/index.ts";
import { assessLights } from "./lights.ts";
import { SlidingPeak } from "./sliding-peak.ts";
import { SustainedCondition } from "./sustained-condition.ts";

const trendWindowMs = 10_000;

export const defaultMonitorOptions: ResourceMonitorOptions = {
  intervalMs: 1000,
  peakWindowMs: 120_000,
  yieldUtilPct: 90,
  yieldHoldMs: 30_000,
};

/**
 * Samples the probe once per interval, keeps the external-usage peaks, and evaluates budgets and lights.
 * Owners register their process ids and the adapters they use; listeners receive every new state.
 */
export class ResourceMonitor {
  readonly ownPids = new Set<number>([process.pid]);
  readonly activeLuids = new Set<string>();
  throughputCliff = false;
  slowVisionRuns = false;
  deviceReset = false;

  private readonly peaks = new Map<string, SlidingPeak>();
  private readonly ownSharedBaseline = new Map<string, number>();
  private readonly availHistory: { atMs: number; bytes: number }[] = [];
  private readonly yieldCondition: SustainedCondition;
  private readonly listeners = new Set<(state: MonitorState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: MonitorState | null = null;

  constructor(private readonly probe: ResourceProbe, private readonly options = defaultMonitorOptions) {
    this.yieldCondition = new SustainedCondition(options.yieldHoldMs);
  }

  get adapters() {
    return this.probe.adapters;
  }

  get latest() {
    return this.state;
  }

  onState(listener: (state: MonitorState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.timer) {
      return;
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), this.options.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Records our shared GPU memory once a load has settled, so later growth can be read as a spill. */
  markLoaded(luid: string) {
    const usage = this.state?.sample.adapters.find((candidate) => candidate.luid === luid);
    if (usage) {
      this.ownSharedBaseline.set(luid, usage.ownSharedBytes);
    }
  }

  /** Admission against the latest tick; throws when called before the first sample exists. */
  admit(plan: LoadPlan): AdmissionDecision {
    if (!this.state) {
      throw new Error("ResourceMonitor.admit called before the first sample");
    }
    return admit(plan, this.probe.adapters, this.state.budgets, this.state.sample.host);
  }

  tick(): MonitorState {
    const sample = this.probe.sample(this.ownPids);
    const now = sample.takenAtMs;

    const budgets = new Map<string, DeviceBudget>();
    let externalBusy = false;
    for (const adapter of this.probe.adapters) {
      const usage = sample.adapters.find((candidate) => candidate.luid === adapter.luid);
      if (!usage) {
        continue;
      }
      const peak = this.peaks.get(adapter.luid) ?? new SlidingPeak(this.options.peakWindowMs);
      this.peaks.set(adapter.luid, peak);
      peak.add(now, externalDedicatedBytes(usage));
      budgets.set(adapter.luid, deviceBudget(adapter, usage, peak.peak(now) ?? 0));
      if (this.activeLuids.has(adapter.luid) && usage.externalUtilPct > this.options.yieldUtilPct) {
        externalBusy = true;
      }
    }

    this.availHistory.push({ atMs: now, bytes: sample.host.availPhysBytes });
    while (this.availHistory.length > 1 && this.availHistory[1]!.atMs <= now - trendWindowMs) {
      this.availHistory.shift();
    }
    const oldest = this.availHistory[0]!;

    const assessment = assessLights(this.probe.adapters, sample, {
      throughputCliff: this.throughputCliff,
      slowVisionRuns: this.slowVisionRuns,
      deviceReset: this.deviceReset,
      ownSharedBaselineBytes: this.ownSharedBaseline,
      availPhysTenSecondsAgoBytes: now - oldest.atMs >= trendWindowMs / 2 ? oldest.bytes : null,
    }, this.activeLuids);

    this.state = { sample, budgets, assessment, yielding: this.yieldCondition.update(now, externalBusy) };
    for (const listener of this.listeners) {
      listener(this.state);
    }
    return this.state;
  }
}
