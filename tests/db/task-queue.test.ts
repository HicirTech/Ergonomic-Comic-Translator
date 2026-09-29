import { describe, expect, it } from "bun:test";
import { createTaskQueue, maxTaskAttempts } from "../../src/db/task-queue.ts";
import { jobState, seededDatabase } from "./fixtures.ts";

const pageTasks = [
  { jobId: "j1", pageId: "p1", stage: "detect", lane: "gpu" as const },
  { jobId: "j1", pageId: "p2", stage: "detect", lane: "gpu" as const, priority: 5 },
];

describe("task queue", () => {
  it("enqueues idempotently per job, page and stage, including volume-level stages", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    queue.enqueue(pageTasks);
    queue.enqueue(pageTasks);
    queue.enqueue([{ jobId: "j1", pageId: null, stage: "names", lane: "llm" }]);
    queue.enqueue([{ jobId: "j1", pageId: null, stage: "names", lane: "llm" }]);
    expect((db.query("SELECT COUNT(*) AS n FROM task").get() as { n: number }).n).toBe(3);
  });

  it("claims by priority, one lane at a time, and never hands out the same task twice", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    queue.enqueue(pageTasks);
    expect(queue.claim("llm")).toBeNull();
    const first = queue.claim("gpu")!;
    const second = queue.claim("gpu")!;
    expect([first.page_id, second.page_id]).toEqual(["p2", "p1"]);
    expect(queue.claim("gpu")).toBeNull();
  });

  it("derives the job state from its tasks; nothing writes 'succeeded' directly", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    expect(jobState(db)).toBe("queued");
    queue.enqueue(pageTasks);
    const a = queue.claim("gpu")!;
    expect(jobState(db)).toBe("running");
    queue.complete(a.id, "key-a");
    const b = queue.claim("gpu")!;
    queue.fail(b.id, "PAGE_FAILED", "这一页处理失败");
    expect(jobState(db)).toBe("partial_failed");
  });

  it("reports needs_review while warn or error flags are open", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    queue.enqueue([pageTasks[0]!]);
    queue.complete(queue.claim("gpu")!.id, "key");
    expect(jobState(db)).toBe("succeeded");
    db.run("INSERT INTO flag (id, volume_id, code, severity, class, created_at) VALUES ('f1', 'v1', 'TR_NEEDS_REVIEW', 'warn', 'decisive', 'now')");
    expect(jobState(db)).toBe("needs_review");
    db.run("UPDATE flag SET status = 'user_resolved' WHERE id = 'f1'");
    expect(jobState(db)).toBe("succeeded");
  });

  it("counts crashes as attempts and fails a task after the limit, but not preemptions", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    queue.enqueue([pageTasks[0]!]);
    for (let round = 0; round < 5; round += 1) {
      queue.preempt(queue.claim("gpu")!.id);
    }
    for (let crash = 1; crash <= maxTaskAttempts; crash += 1) {
      expect(queue.claim("gpu")).not.toBeNull();
      queue.recoverAfterCrash();
    }
    const task = db.query("SELECT state, attempts, preempts, error_code FROM task").get();
    expect(task).toEqual({ state: "failed", attempts: maxTaskAttempts, preempts: 5, error_code: "CRASHED_REPEATEDLY" });
  });

  it("stops handing out work for a cancelled job", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    queue.enqueue(pageTasks);
    const running = queue.claim("gpu")!;
    queue.cancelJob("j1");
    expect(queue.claim("gpu")).toBeNull();
    expect(jobState(db)).toBe("cancelling");
    queue.complete(running.id, "key");
    expect(jobState(db)).toBe("cancelled");
  });

  it("refuses to finish a task that is not running", () => {
    const db = seededDatabase();
    const queue = createTaskQueue(db);
    queue.enqueue([pageTasks[0]!]);
    const id = (db.query("SELECT id FROM task").get() as { id: string }).id;
    expect(() => queue.complete(id, "key")).toThrow("not running");
  });

  it("keeps job parameters immutable", () => {
    const db = seededDatabase();
    expect(() => db.run("UPDATE job SET params_json = '{\"tier\":\"T5\"}' WHERE id = 'j1'")).toThrow("immutable");
  });
});
