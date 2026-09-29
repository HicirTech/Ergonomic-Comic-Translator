/** The worker process exited while requests were pending (native crash, kill, or out of memory). */
export class WorkerCrashedError extends Error {
  readonly code = "WORKER_CRASHED";
  constructor(readonly workerName: string, readonly exitCode: number | null) {
    super(`${workerName} exited (code ${exitCode ?? "unknown"}) with requests pending`);
  }
}
