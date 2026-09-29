// Starts the local server with the web UI and the job runner. Unfinished jobs resume, which loads models:
// during development only with the owner's go-ahead (see CLAUDE.md, G0).
// usage: bun run start [--port 3000] [--cpu]
import { existsSync } from "fs";
import { join, resolve } from "path";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { openDatabase } from "../db/database.ts";
import { createFlagStore } from "../db/flags.ts";
import { createTaskQueue } from "../db/task-queue.ts";
import { createVolumeStore } from "../db/volumes.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor } from "../gov/resource-monitor.ts";
import { JobRunner } from "../jobs/job-runner.ts";
import { createModelHost } from "../jobs/model-host.ts";
import { createVolumeStages } from "../jobs/volume-stages.ts";
import { readModelsLock, readRuntimesLock } from "../models/lock.ts";
import { missingDownloads } from "../models/readiness.ts";
import type { Shaper } from "../typeset/interfaces/index.ts";
import { loadLetteringShaper } from "../typeset/lettering-font.ts";
import { startServer } from "./app.ts";
import { resourceStatus } from "./resource-status.ts";

const defaultPort = 3000;
const statusIntervalMs = 2000;

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : defaultPort;
const paths = dataPaths(resolveDataRoot());
const db = openDatabase(paths.database);
const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.start();

const volumes = createVolumeStore(db);
const flags = createFlagStore(db);
const host = createModelHost(paths, monitor, args.includes("--cpu"));
let shaper: Promise<Shaper> | null = null;
const runner = new JobRunner({
  db,
  queue: createTaskQueue(db),
  volumes,
  stages: createVolumeStages(paths, volumes, flags, host, () => (shaper ??= loadLetteringShaper(paths))),
  host,
  dispatchAllowed: () => (monitor.latest?.assessment.light ?? "green") === "green",
});
runner.start();

const modelsLock = readModelsLock();
const runtimesLock = readRuntimesLock();
const staticRoot = resolve(import.meta.dir, "../../dist/frontend");
const server = startServer({
  paths,
  volumes,
  flags,
  jobs: runner,
  status: () => resourceStatus(monitor.latest ?? monitor.tick(), monitor.adapters, host.loaded),
  missingDownloads: () => missingDownloads(paths, modelsLock, runtimesLock),
  staticRoot: existsSync(join(staticRoot, "index.html")) ? staticRoot : null,
  statusIntervalMs,
}, port);
console.log(`Comic Translator 已启动：http://127.0.0.1:${server.port}`);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log("正在停止：等当前这一步做完，然后释放显卡…");
  await server.stop();
  await runner.stop();
  monitor.stop();
  probe.close();
  db.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
