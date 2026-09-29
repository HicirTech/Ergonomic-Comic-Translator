import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "path";
import { WorkerCrashedError, WorkerTaskError, WorkerTimeoutError } from "../../src/workers/errors/index.ts";
import { WorkerSupervisor } from "../../src/workers/worker-supervisor.ts";

const supervisors: WorkerSupervisor[] = [];
const spawned: number[] = [];
const exited: number[] = [];

const fakeWorker = () => {
  const supervisor = new WorkerSupervisor({
    name: "fake",
    entry: resolve(import.meta.dir, "fake-worker.ts"),
    startTimeoutMs: 10_000,
    onSpawn: (pid) => spawned.push(pid),
    onExit: (pid) => exited.push(pid),
  });
  supervisors.push(supervisor);
  return supervisor;
};

const task = (value: unknown) => ({ kind: "task" as const, engine: "fake", task: value });

afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.stop();
  spawned.length = 0;
  exited.length = 0;
});

describe("WorkerSupervisor", () => {
  it("receives the hello and correlates replies to requests", async () => {
    const worker = fakeWorker();
    expect(await worker.start()).toMatchObject({ kind: "hello", ortVersion: "fake" });
    const replies = await Promise.all([1, 2, 3].map((value) => worker.request(task({ action: "echo", value }), 5000)));
    expect(replies).toEqual([1, 2, 3]);
    expect(spawned).toEqual([worker.pid!]);
  });

  it("turns a NACK into a WorkerTaskError with the worker's code", async () => {
    const worker = fakeWorker();
    const failure = worker.request(task({ action: "fail" }), 5000);
    await expect(failure).rejects.toBeInstanceOf(WorkerTaskError);
    await expect(failure).rejects.toMatchObject({ code: "ENGINE_REFUSED" });
    expect(await worker.request(task({ action: "echo", value: "still alive" }), 5000)).toBe("still alive");
  });

  it("kills a worker that exceeds the request timeout and starts a new one for the next request", async () => {
    const worker = fakeWorker();
    await worker.start();
    const firstPid = worker.pid;
    await expect(worker.request(task({ action: "sleep", ms: 5000 }), 200)).rejects.toBeInstanceOf(WorkerTimeoutError);
    expect(await worker.request(task({ action: "echo", value: "fresh" }), 5000)).toBe("fresh");
    expect(worker.pid).not.toBe(firstPid);
    expect(exited).toContain(firstPid!);
  });

  it("fails every pending request when the worker crashes", async () => {
    const worker = fakeWorker();
    await worker.start();
    const [crash, queuedBehind] = await Promise.allSettled([
      worker.request(task({ action: "crash" }), 5000),
      worker.request(task({ action: "echo", value: "never" }), 5000),
    ]);
    expect(crash).toMatchObject({ status: "rejected", reason: { code: "WORKER_CRASHED", exitCode: 3 } });
    expect(queuedBehind.status === "rejected" && queuedBehind.reason).toBeInstanceOf(WorkerCrashedError);
    expect(await worker.request(task({ action: "echo", value: "restarted" }), 5000)).toBe("restarted");
  });
});
