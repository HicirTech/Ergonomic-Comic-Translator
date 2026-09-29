import type { Database } from "bun:sqlite";
import { nowIso } from "../core/time-utils.ts";
import { ulid } from "../core/ulid.ts";
import type { NewTask, TaskLane, TaskRecord } from "./interfaces/index.ts";

/** A task that crashed this many times is failed instead of retried. */
export const maxTaskAttempts = 3;

/**
 * SQLite-backed work queue. Enqueueing is idempotent per (job, page, stage); claiming is a single
 * UPDATE ... RETURNING so two claimers can never take the same task; completion is never written for
 * a job, only for tasks (the job_state view derives the rest).
 */
export const createTaskQueue = (db: Database) => {
  const insertTask = db.prepare(`
    INSERT INTO task (id, job_id, page_id, stage, lane, input_key, priority)
    VALUES ($id, $jobId, $pageId, $stage, $lane, $inputKey, $priority)
    ON CONFLICT DO NOTHING
  `);
  const claimTask = db.prepare(`
    UPDATE task SET state = 'running', started_at = $now, finished_at = NULL
    WHERE id = (
      SELECT task.id FROM task JOIN job ON job.id = task.job_id
      WHERE task.state = 'queued' AND task.lane = $lane AND job.cancel_requested_at IS NULL
      ORDER BY task.priority DESC, task.rowid
      LIMIT 1
    )
    RETURNING *
  `);
  const finishTask = db.prepare(`
    UPDATE task SET state = $state, output_key = $outputKey, error_code = $errorCode, error_msg_zh = $errorMsgZh, finished_at = $now
    WHERE id = $id AND state = 'running'
  `);
  const preemptTask = db.prepare(`
    UPDATE task SET state = 'queued', preempts = preempts + 1, started_at = NULL
    WHERE id = $id AND state = 'running'
  `);
  const recoverRunning = db.prepare(`
    UPDATE task SET
      attempts = attempts + 1,
      state = CASE WHEN attempts + 1 >= $maxAttempts THEN 'failed' ELSE 'queued' END,
      error_code = CASE WHEN attempts + 1 >= $maxAttempts THEN 'CRASHED_REPEATEDLY' ELSE error_code END,
      started_at = NULL
    WHERE state = 'running'
  `);
  const selectJobTasks = db.prepare(`SELECT * FROM task WHERE job_id = $jobId ORDER BY rowid`);
  const selectQueued = db.prepare(`
    SELECT 1 FROM task JOIN job ON job.id = task.job_id
    WHERE task.state = 'queued' AND task.lane = $lane AND job.cancel_requested_at IS NULL LIMIT 1
  `);
  const requestCancel = db.prepare(`UPDATE job SET cancel_requested_at = $now WHERE id = $jobId AND cancel_requested_at IS NULL`);
  const cancelQueued = db.prepare(`UPDATE task SET state = 'cancelled', finished_at = $now WHERE job_id = $jobId AND state = 'queued'`);

  const expectRunning = (changes: number, id: string) => {
    if (changes !== 1) {
      throw new Error(`Task ${id} is not running`);
    }
  };

  return {
    enqueue: db.transaction((tasks: readonly NewTask[]) => {
      for (const task of tasks) {
        insertTask.run({
          id: ulid(),
          jobId: task.jobId,
          pageId: task.pageId,
          stage: task.stage,
          lane: task.lane,
          inputKey: task.inputKey ?? null,
          priority: task.priority ?? 0,
        });
      }
    }),

    /** Whether `claim(lane)` would return a task now. */
    hasQueued: (lane: TaskLane) => selectQueued.get({ lane }) !== null,

    tasksOf: (jobId: string) => selectJobTasks.all({ jobId }) as TaskRecord[],

    claim: (lane: TaskLane) => (claimTask.get({ lane, now: nowIso() }) as TaskRecord | null) ?? null,

    complete: (id: string, outputKey: string | null, state: "done" | "needs_review" = "done") => {
      expectRunning(finishTask.run({ id, state, outputKey, errorCode: null, errorMsgZh: null, now: nowIso() }).changes, id);
    },

    fail: (id: string, errorCode: string, errorMsgZh: string) => {
      expectRunning(finishTask.run({ id, state: "failed", outputKey: null, errorCode, errorMsgZh, now: nowIso() }).changes, id);
    },

    /** Returns a running task to the queue because the governor needs its resources; not a failed attempt. */
    preempt: (id: string) => {
      expectRunning(preemptTask.run({ id }).changes, id);
    },

    /** At start-up: tasks left running by a crash go back to the queue, or fail after maxTaskAttempts. */
    recoverAfterCrash: () => recoverRunning.run({ maxAttempts: maxTaskAttempts }).changes,

    cancelJob: db.transaction((jobId: string) => {
      const now = nowIso();
      requestCancel.run({ jobId, now });
      cancelQueued.run({ jobId, now });
    }),
  };
};
