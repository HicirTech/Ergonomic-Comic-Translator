import type * as Ort from "onnxruntime-node";
import { enumerateDxgiAdapters } from "../platform/win32/dxgi.ts";
import type { ExecutionProvider } from "../workers/interfaces/index.ts";

/**
 * Threads per CPU session: several workers and sharp share the cores, and llama.cpp needs its own,
 * so ORT must not size its pools to the whole machine.
 */
const cpuIntraOpThreads = 2;
const cpuInterOpThreads = 1;

/**
 * DirectML takes the DXGI EnumAdapters1 index, and that order changes between boots, so the index is
 * resolved from the adapter LUID in the process that creates the session.
 */
export const dmlDeviceIdForLuid = (luid: string) => {
  const index = enumerateDxgiAdapters().findIndex((adapter) => adapter.luid === luid);
  if (index < 0) {
    throw new Error(`No DXGI adapter with LUID ${luid} in this process`);
  }
  return index;
};

export const sessionOptionsFor = (ep: ExecutionProvider): Ort.InferenceSession.SessionOptions => {
  const common: Ort.InferenceSession.SessionOptions = {
    graphOptimizationLevel: "all",
    logSeverityLevel: 3,
    intraOpNumThreads: cpuIntraOpThreads,
    interOpNumThreads: cpuInterOpThreads,
  };
  switch (ep.name) {
    case "cpu":
      return { ...common, executionProviders: ["cpu"] };
    case "dml":
      // DirectML supports neither memory patterns nor parallel execution.
      return { ...common, enableMemPattern: false, executionMode: "sequential", executionProviders: [{ name: "dml", deviceId: dmlDeviceIdForLuid(ep.adapterLuid) }] };
    case "webgpu":
      return { ...common, executionProviders: ["webgpu"] };
  }
};

export const describeEp = (ep: ExecutionProvider) => (ep.name === "dml" ? `dml@${ep.adapterLuid}` : ep.name);
