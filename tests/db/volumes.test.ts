import { describe, expect, it } from "bun:test";
import { openDatabase } from "../../src/db/database.ts";
import { createFlagStore } from "../../src/db/flags.ts";
import { createTaskQueue } from "../../src/db/task-queue.ts";
import { createVolumeStore } from "../../src/db/volumes.ts";

const page = (ordinal: number) => ({
  ordinal,
  displayName: `${ordinal}.jpg`,
  sha256: `sha${ordinal}`,
  storedPath: `/data/pages/sha${ordinal}.jpg`,
  width: 800,
  height: 1200,
});

const newVolume = (readingDirection: "rtl" | "ltr" | null = null) => ({
  title: "卷一",
  pages: [
    { page: page(2), kind: { kind: "textless_variant" as const, variantOf: 1 } },
    { page: page(1), kind: { kind: "main" as const } },
  ],
  sourceLanguage: null,
  readingDirection,
});

describe("volume store", () => {
  it("stores pages in order with content-store file names and links textless variants", () => {
    const volumes = createVolumeStore(openDatabase(":memory:"));
    const id = volumes.create(newVolume());
    const [first, second] = volumes.pages(id);
    expect([first!.ordinal, first!.image_file, first!.kind]).toEqual([1, "sha1.jpg", "main"]);
    expect([second!.kind, second!.variant_of]).toEqual(["textless_variant", first!.id]);
  });

  it("fills in the detected language but keeps a reading direction the user chose", () => {
    const volumes = createVolumeStore(openDatabase(":memory:"));
    const auto = volumes.create(newVolume());
    const chosen = volumes.create(newVolume("ltr"));
    volumes.setLanguage(auto, "ja", 0.9, "rtl");
    volumes.setLanguage(chosen, "ja", 0.9, "rtl");
    expect(volumes.volume(auto)).toMatchObject({ source_lang: "ja", lang_confidence: 0.9, reading_direction: "rtl" });
    expect(volumes.volume(chosen)!.reading_direction).toBe("ltr");
  });

  it("hides deleted volumes and lists the jobs that still need work", () => {
    const db = openDatabase(":memory:");
    const volumes = createVolumeStore(db);
    const kept = volumes.create(newVolume());
    const deleted = volumes.create(newVolume());
    const keptJob = volumes.createJob(kept, "translate_volume", {});
    volumes.createJob(deleted, "translate_volume", {});
    expect(volumes.markDeleted(deleted)).toBe(true);
    expect(volumes.markDeleted(deleted)).toBe(false);
    expect(volumes.list().map((volume) => volume.id)).toEqual([kept]);
    expect(volumes.volume(deleted)).toBeNull();
    expect(volumes.activeJobIds()).toEqual([keptJob]);
    expect(volumes.latestJob(kept)).toMatchObject({ job_id: keptJob, state: "queued", tasks: 0, cancel_requested_at: null });
  });
});

describe("flag store", () => {
  it("replaces only the codes a stage owns and turns a finished job into needs_review", () => {
    const db = openDatabase(":memory:");
    const volumes = createVolumeStore(db);
    const flags = createFlagStore(db);
    const queue = createTaskQueue(db);
    const volumeId = volumes.create(newVolume());
    const [first] = volumes.pages(volumeId);
    const jobId = volumes.createJob(volumeId, "translate_volume", {});
    queue.enqueue([{ jobId, pageId: first!.id, stage: "translate", lane: "llm" }]);
    queue.complete(queue.claim("llm")!.id, "k");
    expect(volumes.job(jobId)!.state).toBe("succeeded");

    flags.replacePageFlags(volumeId, first!.id, ["TR_TERM_MISS"], [{ code: "TR_TERM_MISS", severity: "warn", class: "advisory", evidence: { unit: "1" } }]);
    flags.replacePageFlags(volumeId, first!.id, ["FIT_OVERFLOW"], [{ code: "FIT_OVERFLOW", severity: "warn", class: "advisory", evidence: { unit: "2" } }]);
    expect(flags.openCounts(volumeId)).toEqual([{ ordinal: 1, severity: "warn", count: 2 }]);
    expect(volumes.job(jobId)!.state).toBe("needs_review");

    flags.replacePageFlags(volumeId, first!.id, ["TR_TERM_MISS"], []);
    expect(flags.openCounts(volumeId)).toEqual([{ ordinal: 1, severity: "warn", count: 1 }]);
  });
});
