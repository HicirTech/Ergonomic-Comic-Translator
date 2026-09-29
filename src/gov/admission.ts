import { commitHeadroomBytes, hostHeadroomBytes, umaSpillLimitBytes } from "./headroom.ts";
import type {
  AdmissionDecision,
  AdmissionReason,
  DeviceBudget,
  GpuAdapter,
  HostMemory,
  LoadPlan,
} from "./interfaces/index.ts";

/**
 * Decides whether a load may start. All three pools must fit at once: device-local memory against the
 * external peak, RAM against the host headroom, and commit with 4 GiB left. Never "load and see".
 */
export const admit = (
  plan: LoadPlan,
  adapters: readonly GpuAdapter[],
  budgets: ReadonlyMap<string, DeviceBudget>,
  host: HostMemory,
): AdmissionDecision => {
  const reasons: AdmissionReason[] = [];
  let budget: DeviceBudget | null = null;

  if (plan.adapterLuid !== null) {
    const adapter = adapters.find((candidate) => candidate.luid === plan.adapterLuid);
    budget = budgets.get(plan.adapterLuid) ?? null;
    if (!adapter || !budget) {
      reasons.push("adapter_unknown");
    } else if (adapter.kind === "unsupported") {
      reasons.push("adapter_unsupported");
    } else {
      if (plan.devBytes > budget.availableBytes) {
        reasons.push("device_memory_short");
      }
      if (adapter.kind === "discrete" && plan.spillBytes > 0) {
        reasons.push("spill_forbidden");
      }
      if (adapter.kind === "uma" && plan.spillBytes > umaSpillLimitBytes) {
        reasons.push("spill_over_limit");
      }
    }
  }

  const hostAvailableBytes = Math.max(0, host.availPhysBytes - hostHeadroomBytes(host.totalPhysBytes));
  if (plan.hostPrivateBytes + plan.spillBytes > hostAvailableBytes) {
    reasons.push("host_memory_short");
  }

  const commitAfterBytes = host.commitAvailBytes - (plan.commitBytes ?? plan.hostPrivateBytes + plan.spillBytes);
  if (commitAfterBytes < commitHeadroomBytes) {
    reasons.push("commit_short");
  }

  return { admitted: reasons.length === 0, reasons, budget, hostAvailableBytes, commitAfterBytes };
};
