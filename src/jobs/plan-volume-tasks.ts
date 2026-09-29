import type { NewTask, PageRecord, TaskRecord, TaskState } from "../db/interfaces/index.ts";
import type { VolumeStage } from "./interfaces/index.ts";

const isFinished = (state: TaskState | undefined) => state !== undefined && state !== "queued" && state !== "running";
const isSucceeded = (state: TaskState | undefined) => state === "done" || state === "needs_review";

/**
 * Next tasks of a translate_volume job, from its pages and the tasks it already has. Stages are enqueued
 * only when their inputs exist, so the queue never holds a task that cannot run yet:
 * - vision for every main page (GPU lane);
 * - the glossary once every vision task has finished and at least one page was read (LLM lane);
 * - translate for each page with a vision result once the glossary has finished; the LLM lane claims
 *   them in page order, so every page sees its predecessors' translations as history;
 * - render as soon as a page's own inputs are final: blank pages, textless variants and pages without a
 *   vision result keep their original image (CPU lane);
 * - export once every page is rendered.
 * Enqueueing is idempotent, so calling this again after any change is always safe.
 */
export const planVolumeTasks = (
  jobId: string,
  pages: readonly Pick<PageRecord, "id" | "kind">[],
  tasks: readonly Pick<TaskRecord, "page_id" | "stage" | "state">[],
): NewTask[] => {
  const states = new Map(tasks.map((task) => [`${task.stage}:${task.page_id ?? ""}`, task.state]));
  const stateOf = (stage: VolumeStage, pageId: string | null) => states.get(`${stage}:${pageId ?? ""}`);
  const next: NewTask[] = [];
  const add = (stage: VolumeStage, pageId: string | null, lane: NewTask["lane"]) => {
    if (stateOf(stage, pageId) === undefined) {
      next.push({ jobId, pageId, stage, lane });
    }
  };

  const main = pages.filter((page) => page.kind === "main");
  for (const page of main) add("vision", page.id, "gpu");
  const read = main.some((page) => isSucceeded(stateOf("vision", page.id)));
  if (read && main.every((page) => isFinished(stateOf("vision", page.id)))) {
    add("glossary", null, "llm");
  }
  if (isFinished(stateOf("glossary", null))) {
    for (const page of main) {
      if (isSucceeded(stateOf("vision", page.id))) add("translate", page.id, "llm");
    }
  }

  const renderReady = (page: Pick<PageRecord, "id" | "kind">) => {
    if (page.kind !== "main") return true;
    const vision = stateOf("vision", page.id);
    if (!isFinished(vision)) return false;
    return !isSucceeded(vision) || isFinished(stateOf("translate", page.id));
  };
  for (const page of pages) {
    if (renderReady(page)) add("render", page.id, "cpu");
  }
  if (pages.every((page) => isFinished(stateOf("render", page.id)))) {
    add("export", null, "cpu");
  }
  return next;
};

/** Tasks a translate_volume job takes when every stage succeeds, for progress display. */
export const expectedVolumeTasks = (pages: readonly Pick<PageRecord, "kind">[]) => {
  const main = pages.filter((page) => page.kind === "main").length;
  return main * 2 + (main > 0 ? 1 : 0) + pages.length + 1;
};
