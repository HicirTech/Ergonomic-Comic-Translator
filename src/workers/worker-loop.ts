import type { WorkerHello, WorkerReply, WorkerRequest } from "./interfaces/index.ts";

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "WORKER_ERROR";

/**
 * Child side of the worker protocol: announces itself, then answers each request in arrival order
 * with one ACK or NACK. Requests never overlap, which also keeps each ORT session single-threaded.
 * The child exits when the parent goes away.
 */
export const serveWorker = (
  hello: Omit<WorkerHello, "kind" | "pid">,
  handle: (request: WorkerRequest) => Promise<unknown>,
) => {
  const send = (message: WorkerHello | WorkerReply) => {
    process.send!(message);
  };
  let queue = Promise.resolve();
  process.on("message", (request: WorkerRequest) => {
    queue = queue.then(async () => {
      try {
        send({ seq: request.seq, ok: true, result: await handle(request) });
      } catch (error) {
        send({ seq: request.seq, ok: false, error: { code: errorCode(error), message: error instanceof Error ? error.message : String(error) } });
      }
    });
  });
  process.on("disconnect", () => process.exit(0));
  send({ kind: "hello", pid: process.pid, ...hello });
};
