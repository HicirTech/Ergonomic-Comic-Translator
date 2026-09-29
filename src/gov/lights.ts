import {
  commitCriticalBytes,
  commitHeadroomBytes,
  deviceHeadroomBytes,
  discreteNearFullBytes,
  discreteSpillSignalBytes,
  hostHeadroomBytes,
  umaAvailDropConfirmBytes,
  umaCarveOutCriticalMarginBytes,
  umaSpillSignalBytes,
} from "./headroom.ts";
import type {
  GpuAdapter,
  LightAssessment,
  LightReason,
  LightSignals,
  ResourceSample,
} from "./interfaces/index.ts";

const redReasons: ReadonlySet<LightReason> = new Set<LightReason>([
  "device_free_critical",
  "carve_out_critical",
  "host_memory_critical",
  "commit_critical",
  "shared_spill",
  "throughput_cliff",
  "slow_vision_runs",
  "device_reset",
]);

const memoryReasons: ReadonlySet<LightReason> = new Set<LightReason>([
  "carve_out_high",
  "carve_out_critical",
  "host_memory_low",
  "host_memory_critical",
  "commit_low",
  "commit_critical",
  "shared_spill",
]);

/**
 * Evaluates the yellow/red lights for one sample. Only adapters that hold our models (`activeLuids`) are
 * checked, so load on an unused GPU never pauses work. Yellow pauses dispatch; red aborts and unloads.
 */
export const assessLights = (
  adapters: readonly GpuAdapter[],
  sample: ResourceSample,
  signals: LightSignals,
  activeLuids: ReadonlySet<string>,
): LightAssessment => {
  const reasons = new Set<LightReason>();
  let umaActive = false;

  for (const adapter of adapters) {
    if (!activeLuids.has(adapter.luid) || adapter.kind === "unsupported") {
      continue;
    }
    const usage = sample.adapters.find((candidate) => candidate.luid === adapter.luid);
    if (!usage) {
      continue;
    }
    const headroom = deviceHeadroomBytes(adapter);
    const sharedGrowth = usage.ownSharedBytes - (signals.ownSharedBaselineBytes.get(adapter.luid) ?? usage.ownSharedBytes);

    if (adapter.kind === "discrete") {
      const free = adapter.deviceLocalBytes - usage.dedicatedUsedBytes;
      if (free < headroom / 2) {
        reasons.add("device_free_critical");
      } else if (free < headroom) {
        reasons.add("device_free_low");
      }
      if (sharedGrowth > discreteSpillSignalBytes && free < discreteNearFullBytes) {
        reasons.add("shared_spill");
      }
    } else {
      umaActive = true;
      if (usage.dedicatedUsedBytes > adapter.deviceLocalBytes - umaCarveOutCriticalMarginBytes) {
        reasons.add("carve_out_critical");
      } else if (usage.dedicatedUsedBytes > adapter.deviceLocalBytes - headroom) {
        reasons.add("carve_out_high");
      }
      const availDrop = signals.availPhysTenSecondsAgoBytes === null
        ? 0
        : signals.availPhysTenSecondsAgoBytes - sample.host.availPhysBytes;
      if (sharedGrowth > umaSpillSignalBytes && availDrop >= umaAvailDropConfirmBytes) {
        reasons.add("shared_spill");
      }
    }
  }

  const hostHeadroom = hostHeadroomBytes(sample.host.totalPhysBytes);
  if (sample.host.availPhysBytes < hostHeadroom / 2) {
    reasons.add("host_memory_critical");
  } else if (sample.host.availPhysBytes < hostHeadroom) {
    reasons.add("host_memory_low");
  }
  if (sample.host.commitAvailBytes < commitCriticalBytes) {
    reasons.add("commit_critical");
  } else if (sample.host.commitAvailBytes < commitHeadroomBytes) {
    reasons.add("commit_low");
  }

  if (signals.throughputCliff) {
    // On a UMA laptop a speed cliff with steady memory is usually the power limit throttling, not a spill.
    const confirmed = !umaActive || [...reasons].some((reason) => memoryReasons.has(reason));
    reasons.add(confirmed ? "throughput_cliff" : "throughput_cliff_unconfirmed");
  }
  if (signals.slowVisionRuns) {
    reasons.add("slow_vision_runs");
  }
  if (signals.deviceReset) {
    reasons.add("device_reset");
  }

  const list = [...reasons];
  const light = list.some((reason) => redReasons.has(reason)) ? "red" : list.length > 0 ? "yellow" : "green";
  return { light, reasons: list };
};
