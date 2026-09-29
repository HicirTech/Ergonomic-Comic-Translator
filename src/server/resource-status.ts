import type { GpuAdapter, MonitorState } from "../gov/interfaces/index.ts";
import { adapterKindZh, lightReasonZh, lightZh } from "../gov/messages-zh.ts";
import type { ResourceStatus } from "./interfaces/index.ts";

/** Builds the UI status from the latest governor state; adapters the app never uses are left out. */
export const resourceStatus = (state: MonitorState, adapters: readonly GpuAdapter[], loaded: ResourceStatus["loaded"]): ResourceStatus => ({
  light: state.assessment.light,
  lightZh: lightZh[state.assessment.light],
  reasonsZh: state.assessment.reasons.map((reason) => lightReasonZh[reason]),
  loaded,
  adapters: adapters.filter((adapter) => adapter.kind !== "unsupported").map((adapter) => {
    const usage = state.sample.adapters.find((candidate) => candidate.luid === adapter.luid);
    return {
      name: adapter.name,
      kindZh: adapterKindZh[adapter.kind],
      totalBytes: adapter.deviceLocalBytes,
      availableBytes: state.budgets.get(adapter.luid)?.availableBytes ?? 0,
      externalUtilPct: usage && !Number.isNaN(usage.externalUtilPct) ? usage.externalUtilPct : null,
    };
  }),
});
