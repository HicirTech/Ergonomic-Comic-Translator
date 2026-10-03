import { describe, expect, it } from "bun:test";
import type { TaskState } from "../../src/db/interfaces/index.ts";
import { expectedVolumeTasks, needsReading, planVolumeTasks } from "../../src/jobs/plan-volume-tasks.ts";

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

  it("expects exactly the tasks a fully successful run plans", () => {
    const tasks: ReturnType<typeof task>[] = [];
    for (let next = planVolumeTasks("j", pages, tasks); next.length > 0; next = planVolumeTasks("j", pages, tasks)) {
      tasks.push(...next.map((planned) => task(planned.stage, planned.pageId, "done")));
    }
    expect(tasks).toHaveLength(expectedVolumeTasks(pages));
    expect(expectedVolumeTasks([{ kind: "blank" }])).toBe(2);
  });

  it("reads a page an older import stored as a textless variant exactly like a main page, and still renders blank pages directly", () => {
    const older = pages.map((page) => (page.id === "p1" ? { ...page, kind: "textless_variant" as const } : page));
    expect(planVolumeTasks("j", older, []).map((next) => [next.stage, next.pageId, next.lane])).toEqual([
      ["vision", "p1", "gpu"],
      ["vision", "p3", "gpu"],
      ["render", "p2", "cpu"],
    ]);

    // Every step of a successful run plans what it plans when the page is a main page.
    const tasks: ReturnType<typeof task>[] = [];
    for (let next = planVolumeTasks("j", older, tasks); next.length > 0; next = planVolumeTasks("j", older, tasks)) {
      expect(next).toEqual(planVolumeTasks("j", pages, tasks));
      tasks.push(...next.map((planned) => task(planned.stage, planned.pageId, "done")));
    }
    expect(tasks.filter((entry) => entry.stage === "translate").map((entry) => entry.page_id)).toEqual(["p1", "p3"]);
    expect(tasks.at(-1)).toEqual(task("export", null, "done"));
    expect(tasks).toHaveLength(expectedVolumeTasks(older));
    expect(expectedVolumeTasks(older)).toBe(expectedVolumeTasks(pages));
  });
});

describe("needsReading", () => {
  it("is true for every page except blank ones, so no page is skipped on a guess", () => {
    expect((["main", "textless_variant", "blank"] as const).map((kind) => needsReading({ kind }))).toEqual([true, true, false]);
  });
});
