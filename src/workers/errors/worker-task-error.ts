/** The worker answered with a NACK. */
export class WorkerTaskError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
