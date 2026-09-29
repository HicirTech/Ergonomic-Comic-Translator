import { afterEach, describe, expect, it } from "bun:test";
import { openDatabase } from "../../src/db/database.ts";
import type { JobSummary } from "../../src/db/interfaces/index.ts";
import { createTaskQueue } from "../../src/db/task-queue.ts";
import { createVolumeStore } from "../../src/db/volumes.ts";
import type { ModelHost, RunnerEvent, StageContext, VolumeStage } from "../../src/jobs/interfaces/index.ts";
import { JobRunner } from "../../src/jobs/job-runner.ts";
import type { PageKind } from "../../src/stages/profile/interfaces/index.ts";

const terminalStates = ["succeeded", "needs_review", "partial_failed", "cancelled"];

const fakeHost = () => {
  let loaded: "gpu" | "llm" | null = null;
  let redLight: string | null = null;
  let refusals = 0;
  const opens: string[] = [];
  const host: ModelHost = {
    get loaded() {
      return loaded;
    },
    get redLightReasonZh() {
      return redLight;
    },
    vision: () => {
      throw new Error("not used by fake stages");
    },
    llm: () => {
      throw new Error("not used by fake stages");
    },
    open: async (lane) => {
      if (refusals > 0) {
        refusals -= 1;
        return { kind: "busy", messageZh: "显卡正被占用" };
      }
      opens.push(lane);
      loaded = lane;
      return null;
    },
    close: async () => {
      loaded = null;
      redLight = null;
    },
  };
  return {
    host,
    opens,
    redLight: (reason: string) => {
      redLight = reason;
    },
    refuse: (count: number) => {
      refusals = count;
    },
  };
};

const setup = (kinds: PageKind["kind"][], behaviour: (call: { stage: VolumeStage; ordinal: number | null; attempt: number }) => Promise<void> | void = () => {}) => {
  const db = openDatabase(":memory:");
  const queue = createTaskQueue(db);
  const volumes = createVolumeStore(db);
  const volumeId = volumes.create({
    title: "测试",
    pages: kinds.map((kind, index) => ({
      page: { ordinal: index + 1, displayName: `${index + 1}.png`, sha256: `sha${index + 1}`, storedPath: `/pages/sha${index + 1}.png`, width: 10, height: 10 },
      kind: kind === "textless_variant" ? { kind, variantOf: 1 } : { kind },
    })),
    sourceLanguage: null,
    readingDirection: null,
  });
  const jobId = volumes.createJob(volumeId, "translate_volume", {});
  const fake = fakeHost();
  const calls: { stage: VolumeStage; ordinal: number | null; lane: string | null }[] = [];
  const attempts = new Map<string, number>();
  const stage = (name: VolumeStage) => async (context: StageContext) => {
    const ordinal = context.page?.ordinal ?? null;
    calls.push({ stage: name, ordinal, lane: fake.host.loaded });
    const key = `${name}:${ordinal}`;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    await behaviour({ stage: name, ordinal, attempt });
    return `${key}:out`;
  };
  const runner = new JobRunner({
    db,
    queue,
    volumes,
    stages: { vision: stage("vision"), glossary: stage("glossary"), translate: stage("translate"), render: stage("render"), export: stage("export") },
    host: fake.host,
    dispatchAllowed: () => true,
  }, { pollMs: 5, retryDelayMs: 10, llmIdleUnloadMs: 60_000 });
  const events: RunnerEvent[] = [];
  runner.onEvent((event) => events.push(event));
  const finished = new Promise<JobSummary>((resolve) => {
    runner.onEvent((event) => {
      if (event.type === "job" && event.job.job_id === jobId && terminalStates.includes(event.job.state)) resolve(event.job);
    });
  });
  runners.push(runner);
  return { db, queue, volumes, jobId, runner, fake, calls, events, finished };
};

const runners: JobRunner[] = [];
afterEach(async () => {
  await Promise.all(runners.splice(0).map((runner) => runner.stop()));
});

const order = (calls: { stage: string; ordinal: number | null }[]) => calls.map((call) => `${call.stage}${call.ordinal ?? ""}`);

describe("JobRunner", () => {
  it("runs every stage in dependency order and loads each GPU lane once", async () => {
    const { runner, jobId, calls, fake, finished } = setup(["main", "blank", "main"]);
    runner.start();
    runner.submit(jobId);
    expect((await finished).state).toBe("succeeded");

    const device = calls.filter((call) => ["vision", "glossary", "translate"].includes(call.stage));
    expect(order(device)).toEqual(["vision1", "vision3", "glossary", "translate1", "translate3"]);
    expect(device.map((call) => call.lane)).toEqual(["gpu", "gpu", "llm", "llm", "llm"]);
    expect(fake.opens).toEqual(["gpu", "llm"]);
    const at = (name: string) => order(calls).indexOf(name);
    expect(at("render2")).toBeLessThan(at("glossary"));
    expect(at("render1")).toBeGreaterThan(at("translate1"));
    expect(order(calls).at(-1)).toBe("export");
  });

  it("finishes the volume when a page fails and reports a partial failure", async () => {
    const { runner, jobId, calls, queue, finished } = setup(["main", "main"], ({ stage, ordinal }) => {
      if (stage === "translate" && ordinal === 2) throw new SyntaxError("model output");
    });
    runner.start();
    runner.submit(jobId);
    expect((await finished).state).toBe("partial_failed");
    expect(order(calls)).toContain("render2");
    expect(order(calls).at(-1)).toBe("export");
    const failed = queue.tasksOf(jobId).find((task) => task.state === "failed")!;
    expect([failed.stage, failed.error_code, failed.error_msg_zh]).toEqual(["translate", "STAGE_FAILED", "翻译这一页时出错，这一页保留原图"]);
  });

  it("puts a task back on a red light, unloads, and resumes after reloading", async () => {
    let red: (reason: string) => void = () => {};
    const { runner, jobId, fake, queue, events, finished } = setup(["main"], ({ stage, attempt }) => {
      if (stage === "vision" && attempt === 1) {
        red("显存即将耗尽，正在卸载模型");
        throw new Error("worker killed");
      }
    });
    red = fake.redLight;
    runner.start();
    runner.submit(jobId);
    expect((await finished).state).toBe("succeeded");
    expect(fake.opens).toEqual(["gpu", "gpu", "llm"]);
    const vision = queue.tasksOf(jobId).find((task) => task.stage === "vision")!;
    expect([vision.preempts, vision.attempts]).toEqual([1, 0]);
    expect(events).toContainEqual({ type: "models", lane: null, state: "waiting", messageZh: "红灯：显存即将耗尽，正在卸载模型。恢复后自动继续" });
  });

  it("waits and retries while the models cannot be loaded", async () => {
    const { runner, jobId, fake, events, finished } = setup(["main"]);
    fake.refuse(2);
    runner.start();
    runner.submit(jobId);
    expect((await finished).state).toBe("succeeded");
    expect(events.filter((event) => event.type === "models" && event.state === "waiting")).toHaveLength(2);
  });

  it("cancels queued work and plans nothing after a cancel", async () => {
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runner, jobId, calls, finished } = setup(["main", "main"], async ({ stage, ordinal }) => {
      if (stage === "vision" && ordinal === 1) await blocked;
    });
    runner.start();
    runner.submit(jobId);
    while (!calls.some((call) => call.stage === "vision")) await Bun.sleep(1);
    runner.cancel(jobId);
    release();
    expect((await finished).state).toBe("cancelled");
    expect(order(calls)).toEqual(["vision1"]);
  });

  it("re-runs a task a crash left running", async () => {
    const { runner, jobId, queue, calls, finished } = setup(["blank"]);
    runner.submit(jobId);
    const orphan = queue.claim("cpu")!;
    runner.start();
    expect((await finished).state).toBe("succeeded");
    expect(order(calls)).toEqual(["render1", "export"]);
    expect(queue.tasksOf(jobId).find((task) => task.id === orphan.id)!.attempts).toBe(1);
  });
});
