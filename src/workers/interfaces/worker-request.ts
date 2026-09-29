import type { ExecutionProvider } from "./execution-provider.ts";

/** Parent to worker. `seq` correlates the reply; every request gets exactly one ACK or NACK. */
export type WorkerRequest =
  | { seq: number; kind: "load"; engine: string; modelsRoot: string; ep: ExecutionProvider }
  | { seq: number; kind: "task"; engine: string; task: unknown }
  | { seq: number; kind: "unload"; engine: string }
  | { seq: number; kind: "ping" };
