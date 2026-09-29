import type { Subprocess } from "bun";
import type { WorkerHello, WorkerReply, WorkerRequest, WorkerSupervisorOptions } from "./interfaces/index.ts";
import { WorkerCrashedError, WorkerTaskError, WorkerTimeoutError } from "./errors/index.ts";

type RequestBody = WorkerRequest extends infer Request ? (Request extends WorkerRequest ? Omit<Request, "seq"> : never) : never;

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One child process and the requests sent to it; replies from an old child never reach a new one. */
interface ChildSession {
  child: Subprocess<"ignore", "inherit", "inherit">;
  hello: Promise<WorkerHello>;
  pending: Map<number, Pending>;
}

/**
 * Owns one worker child process: correlates requests and replies by sequence number, enforces a
 * timeout per request (on timeout the child is killed; ORT's run() cannot be interrupted), and fails
 * every pending request when the child dies. The next request starts a fresh child; engines loaded in
 * the old one are gone, so callers re-load (and re-admit) them.
 */
export class WorkerSupervisor {
  private session: ChildSession | null = null;
  private nextSeq = 1;

  constructor(private readonly options: WorkerSupervisorOptions) {}

  get pid() {
    return this.session?.child.pid ?? null;
  }

  /** Starts the child if needed and resolves with its hello (ORT version and DLL path). */
  start(): Promise<WorkerHello> {
    this.session ??= this.spawn();
    return this.session.hello;
  }

  /** Sends one request; resolves with the ACK result, rejects on NACK, timeout or crash. */
  async request(body: RequestBody, timeoutMs: number): Promise<unknown> {
    await this.start();
    const session = this.session;
    if (!session) {
      throw new WorkerCrashedError(this.options.name, null);
    }
    const seq = this.nextSeq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(seq);
        reject(new WorkerTimeoutError(this.options.name, timeoutMs));
        this.terminate(session, new WorkerCrashedError(this.options.name, null));
      }, timeoutMs);
      session.pending.set(seq, { resolve, reject, timer });
      session.child.send({ ...body, seq } as WorkerRequest);
    });
  }

  /** Kills the child immediately; its pending requests fail with WorkerCrashedError. */
  kill() {
    if (this.session) {
      this.terminate(this.session, new WorkerCrashedError(this.options.name, null));
    }
  }

  async stop() {
    const session = this.session;
    if (!session) {
      return;
    }
    this.terminate(session, new WorkerCrashedError(this.options.name, null));
    await session.child.exited;
  }

  private spawn(): ChildSession {
    let resolveHello!: (hello: WorkerHello) => void;
    let rejectHello!: (error: Error) => void;
    const hello = new Promise<WorkerHello>((resolve, reject) => {
      resolveHello = resolve;
      rejectHello = reject;
    });
    // Awaiting callers still see the rejection; this only keeps an unobserved one from being reported.
    hello.catch(() => {});

    const pending = new Map<number, Pending>();
    const child = Bun.spawn({
      cmd: [process.execPath, this.options.entry],
      env: { ...process.env, ...this.options.env },
      stdio: ["ignore", "inherit", "inherit"],
      serialization: "json",
      ipc: (message: WorkerHello | WorkerReply) => {
        if ("kind" in message && message.kind === "hello") {
          clearTimeout(startTimer);
          resolveHello(message);
          return;
        }
        settle(pending, message as WorkerReply);
      },
    });
    const session: ChildSession = { child, hello, pending };

    const startTimer = setTimeout(() => {
      const error = new WorkerTimeoutError(this.options.name, this.options.startTimeoutMs);
      rejectHello(error);
      this.terminate(session, error);
    }, this.options.startTimeoutMs);

    this.options.onSpawn?.(child.pid);
    void child.exited.then((exitCode) => {
      clearTimeout(startTimer);
      this.options.onExit?.(child.pid);
      const error = new WorkerCrashedError(this.options.name, exitCode);
      rejectHello(error);
      this.detach(session, error);
    });
    return session;
  }

  private detach(session: ChildSession, error: Error) {
    if (this.session === session) {
      this.session = null;
    }
    for (const [seq, request] of session.pending) {
      clearTimeout(request.timer);
      request.reject(error);
      session.pending.delete(seq);
    }
  }

  private terminate(session: ChildSession, error: Error) {
    this.detach(session, error);
    session.child.kill("SIGKILL");
  }
}

const settle = (pending: Map<number, Pending>, reply: WorkerReply) => {
  const request = pending.get(reply.seq);
  if (!request) {
    return;
  }
  pending.delete(reply.seq);
  clearTimeout(request.timer);
  if (reply.ok) {
    request.resolve(reply.result);
  } else {
    request.reject(new WorkerTaskError(reply.error.code, reply.error.message));
  }
};
