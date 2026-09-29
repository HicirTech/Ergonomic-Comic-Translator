/** The worker did not answer in time; the supervisor killed it. */
export class WorkerTimeoutError extends Error {
  readonly code = "WORKER_TIMEOUT";
  constructor(readonly workerName: string, readonly timeoutMs: number) {
    super(`${workerName} did not answer within ${timeoutMs} ms and was restarted`);
  }
}
