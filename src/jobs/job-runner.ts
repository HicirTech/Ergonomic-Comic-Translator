import type { Database } from "bun:sqlite";
import type { TaskRecord, TaskState } from "../db/interfaces/index.ts";
import type { createTaskQueue } from "../db/task-queue.ts";
import type { VolumeStore } from "../db/volumes.ts";
import { getLogger } from "../logger.ts";
import type { ModelHost, RunnerEvent, StageRun, VolumeStage } from "./interfaces/index.ts";
import { planVolumeTasks } from "./plan-volume-tasks.ts";

const logger = getLogger("jobs");

export interface JobRunnerOptions {
  /** How often idle lanes look for work (they are also woken when work arrives). */
  pollMs: number;
  /** Wait before trying again when the governor or the GPU lock refuses a load. */
  retryDelayMs: number;
  /** The LLM stays loaded this long without work (loading it again costs about 20 s). */
  llmIdleUnloadMs: number;
}

export const defaultRunnerOptions: JobRunnerOptions = {
  pollMs: 1000,
  retryDelayMs: 15_000,
  llmIdleUnloadMs: 600_000,
};

export interface JobRunnerDeps {
  db: Database;
  queue: ReturnType<typeof createTaskQueue>;
  volumes: VolumeStore;
  stages: Record<VolumeStage, StageRun>;
  host: ModelHost;
  /** False while the governor shows yellow or red, or another program is busy on the GPU. */
  dispatchAllowed: () => boolean;
}

const laneNameZh = { gpu: "图像识别模型", llm: "翻译模型" } as const;

const stageFailedZh: Record<VolumeStage, string> = {
  vision: "识别这一页时出错，这一页保留原图",
  glossary: "整理人物和名词时出错，接下来不带名词表翻译",
  translate: "翻译这一页时出错，这一页保留原图",
  render: "排版这一页时出错，这一页保留原图",
  export: "打包导出时出错",
};

/** Error name and stack frames only: messages can quote model output, and logs never carry text. */
const errorSummary = (error: unknown) =>
  error instanceof Error ? [error.name, ...(error.stack?.split("\n").slice(1, 4).map((line) => line.trim()) ?? [])].join(" | ") : typeof error;

/**
 * Runs queued tasks. The GPU is time-shared: one loop serves the vision lane and the LLM lane, keeping
 * the loaded lane while it has work and switching only when it runs dry; a second loop serves the CPU
 * lane (render, export). After every task the job's next tasks are planned in the same transaction, so a
 * job never looks finished between stages. A red light returns the task to the queue and unloads.
 */
export class JobRunner {
  private stopping = false;
  private loops: Promise<void>[] = [];
  private readonly wakers = new Set<() => void>();
  private readonly listeners = new Set<(event: RunnerEvent) => void>();
  private llmIdleSince: number | null = null;

  constructor(private readonly deps: JobRunnerDeps, private readonly options = defaultRunnerOptions) {}

  onEvent(listener: (event: RunnerEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Recovers tasks a crash left running, plans every unfinished job and starts both loops. */
  start() {
    this.deps.queue.recoverAfterCrash();
    for (const jobId of this.deps.volumes.activeJobIds()) this.advance(jobId);
    this.loops = [this.deviceLoop(), this.cpuLoop()];
  }

  async stop() {
    this.stopping = true;
    this.notify();
    await Promise.all(this.loops);
    await this.unload();
  }

  /** Plans the first tasks of a newly created job. */
  submit(jobId: string) {
    this.advance(jobId);
    this.emitJob(jobId);
    this.notify();
  }

  /** Queued tasks are cancelled at once; a running task finishes, and nothing new is planned. */
  cancel(jobId: string) {
    this.deps.queue.cancelJob(jobId);
    this.emitJob(jobId);
  }

  private emit(event: RunnerEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private emitJob(jobId: string) {
    const job = this.deps.volumes.job(jobId);
    if (job) this.emit({ type: "job", job });
  }

  private notify() {
    for (const wake of [...this.wakers]) wake();
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }

  private advance(jobId: string) {
    const job = this.deps.volumes.job(jobId);
    if (!job || job.cancel_requested_at !== null || job.kind !== "translate_volume") return;
    this.deps.queue.enqueue(planVolumeTasks(jobId, this.deps.volumes.pages(job.volume_id), this.deps.queue.tasksOf(jobId)));
  }

  private async unload() {
    if (this.deps.host.loaded === null) return;
    await this.deps.host.close();
    this.llmIdleSince = null;
    this.emit({ type: "models", lane: null, state: "unloaded", messageZh: "已释放显卡" });
  }

  private nextDeviceLane() {
    const { host, queue } = this.deps;
    if (host.loaded && queue.hasQueued(host.loaded)) return host.loaded;
    if (queue.hasQueued("gpu")) return "gpu";
    return queue.hasQueued("llm") ? "llm" : null;
  }

  /** Loads the lane's models; false (after waiting) when they cannot be loaded now. */
  private async load(lane: "gpu" | "llm") {
    this.emit({ type: "models", lane, state: "loading", messageZh: `正在加载${laneNameZh[lane]}…` });
    let failureZh: string | null;
    try {
      failureZh = (await this.deps.host.open(lane))?.messageZh ?? null;
    } catch (error) {
      logger.error(`Loading the ${lane} lane failed: ${errorSummary(error)}`);
      failureZh = `${laneNameZh[lane]}加载失败`;
    }
    if (failureZh !== null) {
      this.emit({ type: "models", lane, state: "waiting", messageZh: `${failureZh}，稍后自动重试` });
      await this.sleep(this.options.retryDelayMs);
      return false;
    }
    this.emit({ type: "models", lane, state: "loaded", messageZh: `${laneNameZh[lane]}已就绪` });
    return true;
  }

  private async deviceLoop() {
    const { host, queue } = this.deps;
    while (!this.stopping) {
      const redLightZh = host.redLightReasonZh;
      if (redLightZh !== null) {
        await this.unload();
        this.emit({ type: "models", lane: null, state: "waiting", messageZh: `红灯：${redLightZh}。恢复后自动继续` });
        continue;
      }
      if (!this.deps.dispatchAllowed()) {
        await this.sleep(this.options.pollMs);
        continue;
      }
      const lane = this.nextDeviceLane();
      if (!lane) {
        if (host.loaded === "gpu") {
          // Vision memory goes back at once; the LLM may be needed again soon.
          await this.unload();
        } else if (host.loaded === "llm") {
          this.llmIdleSince ??= Date.now();
          if (Date.now() - this.llmIdleSince >= this.options.llmIdleUnloadMs) await this.unload();
        }
        await this.sleep(this.options.pollMs);
        continue;
      }
      if (host.loaded !== lane && !(await this.load(lane))) continue;
      this.llmIdleSince = null;
      const task = queue.claim(lane);
      if (task) await this.runTask(task);
    }
  }

  private async cpuLoop() {
    while (!this.stopping) {
      const task = this.deps.queue.claim("cpu");
      if (task) await this.runTask(task);
      else await this.sleep(this.options.pollMs);
    }
  }

  private async runTask(task: TaskRecord) {
    const { db, queue, volumes, host } = this.deps;
    const job = volumes.job(task.job_id)!;
    const volume = volumes.volume(job.volume_id);
    const pages = volume ? volumes.pages(volume.id) : [];
    const page = task.page_id ? pages.find((candidate) => candidate.id === task.page_id) ?? null : null;
    const report = (state: TaskState) => this.emit({
      type: "task",
      jobId: task.job_id,
      volumeId: job.volume_id,
      stage: task.stage,
      pageOrdinal: page?.ordinal ?? null,
      state,
    });
    const stage = task.stage as VolumeStage;

    if (!volume) {
      queue.fail(task.id, "VOLUME_DELETED", "这本书已删除");
      report("failed");
    } else {
      report("running");
      try {
        const outputKey = await this.deps.stages[stage]({ task, volume, pages, page });
        db.transaction(() => {
          queue.complete(task.id, outputKey);
          this.advance(task.job_id);
        })();
        report("done");
      } catch (error) {
        if (task.lane !== "cpu" && host.redLightReasonZh !== null) {
          // The governor killed the models under this task: not the task's fault, run it again later.
          queue.preempt(task.id);
          report("queued");
        } else {
          logger.error(`Task ${task.id} (${task.stage}) failed: ${errorSummary(error)}`);
          db.transaction(() => {
            queue.fail(task.id, "STAGE_FAILED", stageFailedZh[stage]);
            this.advance(task.job_id);
          })();
          report("failed");
        }
      }
    }
    this.emitJob(task.job_id);
    this.notify();
  }
}
