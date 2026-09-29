// Runs the vision half of the pipeline (detect, lines, OCR, masks, cleaning) over a volume, without any LLM.
// Loads ONNX models on the GPU: only with the owner's go-ahead (see CLAUDE.md, G0).
// usage: bun run vision <zip|cbz|folder|image...> [--out <dir>] [--cpu] [--prior v|h]
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { GiB } from "../core/units.ts";
import { visionResidentBytes } from "../gov/footprint-estimate.ts";
import { tryAcquireGpuLock } from "../gov/gpu-lock.ts";
import { admissionReasonZh, lightReasonZh } from "../gov/messages-zh.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor } from "../gov/resource-monitor.ts";
import { runVisionPage } from "../pipeline/vision-page.ts";
import { createWorkerVisionClient } from "../pipeline/worker-vision-client.ts";
import { ingestEntries } from "../stages/ingest/ingest.ts";
import { readSources } from "../stages/ingest/read-sources.ts";
import type { ExecutionProvider } from "../workers/interfaces/index.ts";
import { WorkerSupervisor } from "../workers/worker-supervisor.ts";

/** Private memory of the two worker processes with all vision sessions (estimate until measured). */
const workersHostBytes = 1.5 * GiB;
const workerStartTimeoutMs = 60_000;

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const inputs = args.filter((arg, index) => !arg.startsWith("--") && !["--out", "--prior"].includes(args[index - 1] ?? ""));
if (inputs.length === 0) {
  console.error("用法：bun run vision <zip|cbz|文件夹|图片...> [--out 目录] [--cpu] [--prior v|h]");
  process.exit(64);
}
const prior = option("--prior") === "h" ? "h" : "v";
const paths = dataPaths(resolveDataRoot());
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const out = resolve(option("--out") ?? join(paths.root, "runs", `vision-${stamp}`));
mkdirSync(join(out, "work"), { recursive: true });
mkdirSync(join(out, "results"), { recursive: true });

const { pages, skipped } = await ingestEntries(await readSources(inputs.map((input) => resolve(input))), join(paths.cache, "pages"));
console.log(`读入 ${pages.length} 页，跳过 ${skipped.length} 个文件；结果目录：${out}`);

const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.tick();
const gpuAdapter = args.includes("--cpu")
  ? null
  : [...probe.adapters]
    .filter((adapter) => adapter.kind !== "unsupported")
    .sort((a, b) => (monitor.latest!.budgets.get(b.luid)?.availableBytes ?? 0) - (monitor.latest!.budgets.get(a.luid)?.availableBytes ?? 0))[0] ?? null;
const gpuEp: ExecutionProvider = gpuAdapter ? { name: "dml", adapterLuid: gpuAdapter.luid } : { name: "cpu" };

const decision = monitor.admit({
  label: "vision",
  adapterLuid: gpuAdapter?.luid ?? null,
  devBytes: gpuAdapter ? visionResidentBytes : 0,
  spillBytes: 0,
  hostPrivateBytes: workersHostBytes,
});
if (!decision.admitted) {
  console.error(`资源不足，未加载任何模型：${decision.reasons.map((reason) => admissionReasonZh[reason]).join("；")}`);
  process.exit(2);
}

const lock = tryAcquireGpuLock(paths, "vision cli");
if (!lock.acquired) {
  console.error(`显卡正被占用：${lock.owner ? `PID ${lock.owner.pid}（${lock.owner.purpose}）` : "另一个进程"}`);
  process.exit(3);
}

const entry = resolve(import.meta.dir, "../workers/vision-worker.ts");
const supervisor = (name: string) => new WorkerSupervisor({
  name,
  entry,
  startTimeoutMs: workerStartTimeoutMs,
  onSpawn: (pid) => monitor.ownPids.add(pid),
  onExit: (pid) => monitor.ownPids.delete(pid),
});
const gpu = supervisor("vision-gpu");
const cpu = supervisor("vision-cpu");
const { client, loadAll } = createWorkerVisionClient(gpu, cpu);

let aborted = false;
monitor.onState((state) => {
  if (state.assessment.light === "red" && !aborted) {
    aborted = true;
    console.error(`红灯，停止并释放显卡：${state.assessment.reasons.map((reason) => lightReasonZh[reason]).join("；")}`);
    gpu.kill();
    cpu.kill();
  }
});

try {
  if (gpuAdapter) monitor.activeLuids.add(gpuAdapter.luid);
  monitor.start();
  const loads = await loadAll(paths.models, gpuEp);
  console.log(`模型已加载：${loads.map((load) => `${load.engine}@${load.ep} ${Math.round(load.loadMs)} ms`).join("，")}`);
  if (gpuAdapter) monitor.markLoaded(gpuAdapter.luid);

  for (const page of pages) {
    while (!aborted && monitor.latest?.assessment.light === "yellow") {
      await Bun.sleep(1000);
    }
    if (aborted) break;
    const result = await runVisionPage(client, page.storedPath, page.sha256, join(out, "work"), prior);
    writeFileSync(join(out, "results", `${String(page.ordinal).padStart(4, "0")}.json`), JSON.stringify({ page, result }));
    const utterances = result.regions.reduce((sum, region) => sum + region.utterances.length, 0);
    const total = Object.values(result.timingsMs).reduce((sum, ms) => sum + ms, 0);
    console.log(`第 ${page.ordinal}/${pages.length} 页：${result.regions.length} 个区域，${utterances} 句，用时 ${(total / 1000).toFixed(1)} s`);
  }
} catch (error) {
  // A red light kills the workers on purpose; the in-flight request failing is the expected result.
  if (!aborted) throw error;
} finally {
  monitor.stop();
  await gpu.stop();
  await cpu.stop();
  lock.release();
  probe.close();
}
