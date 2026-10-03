import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { dataPaths } from "../../src/core/data-paths.ts";
import { openDatabase } from "../../src/db/database.ts";
import { createFlagStore } from "../../src/db/flags.ts";
import { createTaskQueue } from "../../src/db/task-queue.ts";
import { createVolumeStore } from "../../src/db/volumes.ts";
import type { ModelHost, VolumeText } from "../../src/jobs/interfaces/index.ts";
import { volumeFiles } from "../../src/jobs/volume-files.ts";
import { createVolumeStages } from "../../src/jobs/volume-stages.ts";
import type { LlmSession } from "../../src/sessions/interfaces/index.ts";
import type { PageKind } from "../../src/stages/profile/interfaces/index.ts";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ct-stages-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** One dialogue bubble with one line of text, as much of the vision stage's output as the glossary stage reads. */
const visionWithText = (text: string) => ({
  regions: [{
    box: { x0: 10, y0: 10, x1: 50, y1: 50 },
    classification: { layout: "bubble", kind: "dialogue", policy: "translate" },
    utterances: [{ text, nameTag: false, thought: false }],
  }],
});

/** Finds no names in any chunk, so the glossary stage runs without a model. */
const session: LlmSession = {
  complete: async () => ({
    content: JSON.stringify({ entities: [] }),
    reasoningContent: "",
    finishReason: "stop",
    promptTokens: 0,
    cachedTokens: 0,
    completionTokens: 0,
    generationTokensPerSecond: null,
    elapsedMs: 0,
  }),
  tierId: "test",
  tierLabel: "test",
  modelSha: "sha",
  device: "none",
  signal: new AbortController().signal,
  close: async () => {},
};
const host: ModelHost = {
  loaded: "llm",
  redLightReasonZh: null,
  vision: () => {
    throw new Error("not used by the glossary stage");
  },
  llm: () => session,
  open: async () => null,
  close: async () => {},
};

describe("glossary stage", () => {
  it("collects the text of every page that was read, including a variant an older import stored as textless", async () => {
    const db = openDatabase(":memory:");
    const volumes = createVolumeStore(db);
    const kinds: PageKind[] = [{ kind: "main" }, { kind: "textless_variant", variantOf: 1 }, { kind: "blank" }];
    const volumeId = volumes.create({
      title: "测试",
      pages: kinds.map((kind, index) => ({
        page: { ordinal: index + 1, displayName: `${index + 1}.png`, sha256: `sha${index + 1}`, storedPath: `/pages/sha${index + 1}.png`, width: 10, height: 10 },
        kind,
      })),
      sourceLanguage: "ja",
      readingDirection: null,
    });
    const paths = dataPaths(root);
    const files = volumeFiles(paths, volumeId);
    for (const ordinal of [1, 2]) {
      mkdirSync(dirname(files.vision(ordinal)), { recursive: true });
      writeFileSync(files.vision(ordinal), JSON.stringify(visionWithText(`おはよう${ordinal}`)));
    }
    const queue = createTaskQueue(db);
    queue.enqueue([{ jobId: volumes.createJob(volumeId, "translate_volume", {}), pageId: null, stage: "glossary", lane: "llm" }]);

    const stages = createVolumeStages(paths, volumes, createFlagStore(db), host, () => {
      throw new Error("not used by the glossary stage");
    });
    await stages.glossary({ task: queue.claim("llm")!, volume: volumes.volume(volumeId)!, pages: volumes.pages(volumeId), page: null });

    const text = JSON.parse(readFileSync(files.text, "utf8")) as VolumeText;
    expect(text.pages.map((page) => [page.page, page.units.map((unit) => unit.source)])).toEqual([[1, ["おはよう1"]], [2, ["おはよう2"]]]);
  });
});
