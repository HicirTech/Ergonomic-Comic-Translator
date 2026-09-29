import type { DataPaths } from "../core/data-paths.ts";
import type { ResourceMonitor } from "../gov/resource-monitor.ts";
import type { LlmSession, VisionSession } from "../sessions/interfaces/index.ts";
import { openLlmSession } from "../sessions/llm-session.ts";
import { openVisionSession } from "../sessions/vision-session.ts";
import type { ModelHost } from "./interfaces/index.ts";

/** ModelHost over the real vision workers and llama-server, admitted by `monitor` (which must be running). */
export const createModelHost = (paths: DataPaths, monitor: ResourceMonitor, cpuOnly: boolean): ModelHost => {
  let current: { lane: "gpu"; session: VisionSession } | { lane: "llm"; session: LlmSession } | null = null;

  const close = async () => {
    const closing = current;
    current = null;
    await closing?.session.close();
  };

  return {
    get loaded() {
      return current?.lane ?? null;
    },
    get redLightReasonZh() {
      return current?.session.signal.aborted ? String(current.session.signal.reason) : null;
    },
    vision: () => {
      if (current?.lane !== "gpu") throw new Error("Vision models are not loaded");
      return current.session;
    },
    llm: () => {
      if (current?.lane !== "llm") throw new Error("The LLM is not loaded");
      return current.session;
    },
    open: async (lane) => {
      if (current?.lane === lane && !current.session.signal.aborted) return null;
      await close();
      if (lane === "gpu") {
        const opening = await openVisionSession(paths, monitor, cpuOnly, "translate job: vision");
        if (!opening.ok) return opening.failure;
        current = { lane, session: opening.session };
      } else {
        const opening = await openLlmSession(paths, monitor, "translate job: llm");
        if (!opening.ok) return opening.failure;
        current = { lane, session: opening.session };
      }
      return null;
    },
    close,
  };
};
