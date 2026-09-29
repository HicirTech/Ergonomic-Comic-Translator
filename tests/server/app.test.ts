import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { dataPaths } from "../../src/core/data-paths.ts";
import { openDatabase } from "../../src/db/database.ts";
import { createFlagStore } from "../../src/db/flags.ts";
import { createVolumeStore } from "../../src/db/volumes.ts";
import type { RunnerEvent } from "../../src/jobs/interfaces/index.ts";
import { volumeFiles } from "../../src/jobs/volume-files.ts";
import { startServer } from "../../src/server/app.ts";
import type { ImportResult, ResourceStatus, VolumeDetail, VolumeSummary } from "../../src/server/interfaces/index.ts";
import { clientHeader } from "../../src/server/request-guard.ts";

const status: ResourceStatus = { light: "green", lightZh: "正常", reasonsZh: [], loaded: null, adapters: [] };

let root = "";
let server: ReturnType<typeof startServer>;
let jobs: { submitted: string[]; cancelled: string[]; listeners: Set<(event: RunnerEvent) => void> };
let missing: { models: string[]; runtimes: string[] };
let volumes: ReturnType<typeof createVolumeStore>;
let base = "";

const client = { [clientHeader]: "1" };
/** A textured gray page (solid pages count as blank); its first pixel is `shade`. */
const png = async (shade: number) => {
  const pixels = Buffer.alloc(40 * 60, 0).map((_, index) => (index * 37 + shade) % 256);
  return new Uint8Array(await sharp(pixels, { raw: { width: 40, height: 60, channels: 1 } }).png().toBuffer());
};

const uploadForm = async (title?: string) => {
  const form = new FormData();
  // Loose images keep their folder path in the file name, as the web UI sends them.
  form.append("files", new File([await png(30)], "chapter/2.png"));
  form.append("files", new File([await png(90)], "chapter/10.png"));
  if (title) form.append("title", title);
  return form;
};

const upload = async (title?: string) => {
  const response = await fetch(`${base}/api/volumes`, { method: "POST", headers: client, body: await uploadForm(title) });
  expect(response.status).toBe(201);
  return (await response.json()) as ImportResult;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ct-server-"));
  const staticRoot = join(root, "web");
  mkdirSync(join(staticRoot, "assets"), { recursive: true });
  writeFileSync(join(staticRoot, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(staticRoot, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(root, "secret.txt"), "secret");
  const db = openDatabase(":memory:");
  volumes = createVolumeStore(db);
  jobs = { submitted: [], cancelled: [], listeners: new Set() };
  missing = { models: [], runtimes: [] };
  server = startServer({
    paths: dataPaths(root),
    volumes,
    flags: createFlagStore(db),
    jobs: {
      submit: (jobId) => void jobs.submitted.push(jobId),
      cancel: (jobId) => void jobs.cancelled.push(jobId),
      onEvent: (listener) => {
        jobs.listeners.add(listener);
        return () => jobs.listeners.delete(listener);
      },
    },
    status: () => status,
    missingDownloads: () => missing,
    staticRoot,
    statusIntervalMs: 60_000,
  }, 0);
  base = `http://127.0.0.1:${server.port}`;
});

afterEach(async () => {
  await server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("request guard", () => {
  it("refuses writes without the client header, foreign origins and foreign host names", async () => {
    expect((await fetch(`${base}/api/volumes`, { method: "POST", body: await uploadForm() })).status).toBe(403);
    expect((await fetch(`${base}/api/volumes`, { method: "POST", headers: { ...client, Origin: "https://evil.example" }, body: await uploadForm() })).status).toBe(403);
    expect((await fetch(`${base}/api/volumes`, { headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await fetch(`${base}/api/volumes`, { headers: { Origin: `http://localhost:5173` } })).status).toBe(200);
  });
});

describe("volumes API", () => {
  it("imports dropped images in natural order and serves both page images", async () => {
    const result = await upload();
    expect(result).toMatchObject({ title: "chapter", pages: 2, blank: 0, textless: 0, skipped: 0 });
    const list = (await (await fetch(`${base}/api/volumes`)).json()) as VolumeSummary[];
    expect(list.map((volume) => [volume.title, volume.pageCount, volume.job])).toEqual([["chapter", 2, null]]);

    const detail = (await (await fetch(`${base}/api/volumes/${result.volumeId}`)).json()) as VolumeDetail;
    expect(detail.pages.map((page) => [page.ordinal, page.kind, page.translated])).toEqual([[1, "main", false], [2, "main", false]]);
    const original = await fetch(`${base}/api/volumes/${result.volumeId}/pages/1/original`);
    const { data } = await sharp(new Uint8Array(await original.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(30);
    expect((await fetch(`${base}/api/volumes/${result.volumeId}/pages/1/translated`)).status).toBe(404);
    expect((await fetch(`${base}/api/volumes/${result.volumeId}/pages/9/original`)).status).toBe(404);
  });

  it("starts a job only when everything is downloaded and only once at a time, and cancels it", async () => {
    const { volumeId } = await upload("卷一");
    const start = () => fetch(`${base}/api/volumes/${volumeId}/start`, { method: "POST", headers: client });
    missing = { models: ["baberu-ocr"], runtimes: [] };
    const refused = await start();
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { errorZh: string }).errorZh).toContain("baberu-ocr");

    missing = { models: [], runtimes: [] };
    const started = await start();
    expect(started.status).toBe(202);
    const { jobId } = (await started.json()) as { jobId: string };
    expect(jobs.submitted).toEqual([jobId]);
    expect((await start()).status).toBe(409);

    expect((await fetch(`${base}/api/volumes/${volumeId}/cancel`, { method: "POST", headers: client })).status).toBe(202);
    expect(jobs.cancelled).toEqual([jobId]);
  });

  it("offers exports once they exist, named after the volume", async () => {
    const { volumeId } = await upload("卷一");
    expect((await fetch(`${base}/api/volumes/${volumeId}/export/cbz`)).status).toBe(404);
    const files = volumeFiles(dataPaths(root), volumeId);
    mkdirSync(join(files.root, "export"), { recursive: true });
    writeFileSync(files.cbz, "zip");
    const response = await fetch(`${base}/api/volumes/${volumeId}/export/cbz`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("卷一.cbz")}`);
    expect((await fetch(`${base}/api/volumes/${volumeId}/export/exe`)).status).toBe(404);
  });

  it("deletes a volume and cancels its running job", async () => {
    const { volumeId } = await upload();
    await fetch(`${base}/api/volumes/${volumeId}/start`, { method: "POST", headers: client });
    expect((await fetch(`${base}/api/volumes/${volumeId}`, { method: "DELETE", headers: client })).status).toBe(204);
    expect(jobs.cancelled).toHaveLength(1);
    expect(await (await fetch(`${base}/api/volumes`)).json()).toEqual([]);
    expect((await fetch(`${base}/api/volumes/${volumeId}`)).status).toBe(404);
  });
});

describe("events", () => {
  it("streams the status first, then runner events", async () => {
    const response = await fetch(`${base}/api/events`);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const readUntil = async (marker: string) => {
      while (!text.includes(marker)) text += decoder.decode((await reader.read()).value);
    };
    await readUntil("event: status");
    for (const listener of jobs.listeners) {
      listener({ type: "task", jobId: "j", volumeId: "v", stage: "vision", pageOrdinal: 3, state: "running" });
    }
    await readUntil("event: task");
    expect(text).toContain(`"pageOrdinal":3`);
    await reader.cancel();
  });
});

describe("static files", () => {
  it("serves the app, falls back to the shell for client routes and never leaves its folder", async () => {
    expect(await (await fetch(`${base}/assets/app.js`)).text()).toBe("console.log(1)");
    expect(await (await fetch(`${base}/volumes/abc`)).text()).toContain("<title>app</title>");
    expect(await (await fetch(`${base}/..%2Fsecret.txt`)).text()).not.toContain("secret");
    expect((await fetch(`${base}/api/nothing`)).status).toBe(404);
  });
});
