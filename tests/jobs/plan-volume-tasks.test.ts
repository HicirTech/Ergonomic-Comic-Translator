import { describe, expect, it } from "bun:test";
import type { TaskState } from "../../src/db/interfaces/index.ts";
import { planVolumeTasks } from "../../src/jobs/plan-volume-tasks.ts";

const pages = [
  { id: "p1", kind: "main" as const },
  { id: "p2", kind: "blank" as const },
  { id: "p3", kind: "main" as const },
];
const task = (stage: string, pageId: string | null, state: TaskState) => ({ stage, page_id: pageId, state });
const planned = (tasks: ReturnType<typeof task>[]) => planVolumeTasks("j", pages, tasks).map((next) => `${next.stage}:${next.pageId ?? "-"}:${next.lane}`);

describe("planVolumeTasks", () => {
  it("starts with vision for main pages and renders the blank page right away", () => {
    expect(planned([])).toEqual(["vision:p1:gpu", "vision:p3:gpu", "render:p2:cpu"]);
  });

  it("waits for every vision task before the glossary, and plans nothing twice", () => {
    const tasks = [task("vision", "p1", "done"), task("vision", "p3", "running"), task("render", "p2", "done")];
    expect(planned(tasks)).toEqual([]);
    tasks[1] = task("vision", "p3", "failed");
    expect(planned(tasks)).toEqual(["glossary:-:llm", "render:p3:cpu"]);
  });

  it("never loads the LLM for a volume without readable pages", () => {
    expect(planVolumeTasks("j", [{ id: "b", kind: "blank" }], [task("render", "b", "done")]).map((next) => next.stage)).toEqual(["export"]);
    const failed = [task("vision", "p1", "failed"), task("vision", "p3", "failed"), task("render", "p2", "done")];
    expect(planned(failed)).toEqual(["render:p1:cpu", "render:p3:cpu"]);
  });

  it("translates only pages with a vision result, after the glossary finished even if it failed", () => {
    const tasks = [task("vision", "p1", "done"), task("vision", "p3", "failed"), task("glossary", null, "running"), task("render", "p2", "done"), task("render", "p3", "done")];
    expect(planned(tasks)).toEqual([]);
    tasks[2] = task("glossary", null, "failed");
    expect(planned(tasks)).toEqual(["translate:p1:llm"]);
  });

  it("renders a page once its translation is final and exports after the last render", () => {
    const tasks = [
      task("vision", "p1", "done"), task("vision", "p3", "done"), task("glossary", null, "done"),
      task("translate", "p1", "needs_review"), task("translate", "p3", "queued"), task("render", "p2", "done"),
    ];
    expect(planned(tasks)).toEqual(["render:p1:cpu"]);
    tasks[4] = task("translate", "p3", "done");
    tasks.push(task("render", "p1", "done"));
    expect(planned(tasks)).toEqual(["render:p3:cpu"]);
    tasks.push(task("render", "p3", "failed"));
    expect(planned(tasks)).toEqual(["export:-:cpu"]);
  });
});
