// Translates a volume from a vision run (bun run vision): names and terms first, then page by page.
// Loads an LLM on the GPU: only with the owner's go-ahead (see CLAUDE.md, G0).
// usage: bun run translate <vision-run-dir> [--lang ja|ko|zh-Hant|en] [--ltr] [--history 2000]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { MiB } from "../core/units.ts";
import { tryAcquireGpuLock } from "../gov/gpu-lock.ts";
import { hostHeadroomBytes } from "../gov/headroom.ts";
import { admissionReasonZh, lightReasonZh } from "../gov/messages-zh.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor } from "../gov/resource-monitor.ts";
import { ThroughputCliffDetector } from "../gov/throughput-cliff.ts";
import { fitTiers, recommendTier } from "../gov/tiers.ts";
import { createChatClient } from "../llm/chat-client.ts";
import { deviceForAdapter, parseListDevices } from "../llm/list-devices.ts";
import { findFreePort, LlamaServer } from "../llm/llama-server.ts";
import { modelFilePath, readModelsLock, readRuntimesLock } from "../models/lock.ts";
import { llamaCppDirectory } from "../models/runtime-install.ts";
import { buildGlossary } from "../pipeline/build-glossary.ts";
import type { PageVisionResult } from "../pipeline/interfaces/index.ts";
import { translateVolume } from "../pipeline/translate-volume.ts";
import { pageText } from "../pipeline/volume-text.ts";
import type { CompleteFn, SourceLanguage } from "../translate/interfaces/index.ts";

const contextPerSlot = 8192;
const llmThreads = 4;
const loadTimeoutMs = 300_000;
/** A page translation (all retry rounds) may take at most this long per request. */
const requestTimeoutMs = 90_000;

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const runDirectory = args.find((arg, index) => !arg.startsWith("--") && !["--lang", "--history"].includes(args[index - 1] ?? ""));
if (!runDirectory) {
  console.error("用法：bun run translate <vision 结果目录> [--lang ja|ko|zh-Hant|en] [--ltr] [--history 2000]");
  process.exit(64);
}
const language = (option("--lang") ?? "ja") as SourceLanguage;
const historyBudget = Number(option("--history") ?? 2000);
const run = resolve(runDirectory);

const pages = readdirSync(join(run, "results")).filter((name) => name.endsWith(".json")).sort().map((name) => {
  const { page, result } = JSON.parse(readFileSync(join(run, "results", name), "utf8")) as { page: { ordinal: number }; result: PageVisionResult };
  return pageText(page.ordinal, result.regions, args.includes("--ltr") ? "ltr" : "rtl");
});
console.log(`读入 ${pages.length} 页，${pages.reduce((sum, page) => sum + page.units.length, 0)} 句`);

const paths = dataPaths(resolveDataRoot());
const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.tick();
const host = monitor.latest!.sample.host;
const hostAvailable = Math.max(0, host.availPhysBytes - hostHeadroomBytes(host.totalPhysBytes));
const modelsLock = readModelsLock();
const budgetOf = (luid: string) => monitor.latest!.budgets.get(luid)!.availableBytes;
const choices = probe.adapters
  .filter((adapter) => adapter.kind !== "unsupported")
  .sort((a, b) => budgetOf(b.luid) - budgetOf(a.luid))
  .map((adapter) => ({ adapter, fit: recommendTier(fitTiers(modelsLock, adapter.kind, budgetOf(adapter.luid), hostAvailable)) }))
  .filter((choice) => choice.fit?.tier.device === "gpu");
const gpu = choices[0] ?? null;
const fit = gpu?.fit ?? recommendTier(fitTiers(modelsLock, "unsupported", 0, hostAvailable));
if (!fit) {
  console.error("内存不足，没有可以运行的翻译档位。");
  process.exit(2);
}
const decision = monitor.admit({
  label: fit.tier.id,
  adapterLuid: gpu?.adapter.luid ?? null,
  devBytes: fit.devBytes,
  spillBytes: 0,
  hostPrivateBytes: fit.hostPrivateBytes,
});
if (!decision.admitted) {
  console.error(`资源不足，未加载模型：${decision.reasons.map((reason) => admissionReasonZh[reason]).join("；")}`);
  process.exit(2);
}
const lock = tryAcquireGpuLock(paths, `translate ${fit.tier.id}`);
if (!lock.acquired) {
  console.error(`显卡正被占用：${lock.owner ? `PID ${lock.owner.pid}（${lock.owner.purpose}）` : "另一个进程"}`);
  process.exit(3);
}

const runtimes = readRuntimesLock();
const backend = gpu ? "vulkan" : "cpu";
const executable = join(llamaCppDirectory(paths, runtimes, `${process.platform}-${process.arch}-${backend}`), process.platform === "win32" ? "llama-server.exe" : "llama-server");
let device = "none";
if (gpu) {
  const listing = Bun.spawnSync([executable, "--list-devices"]);
  const match = deviceForAdapter(parseListDevices(listing.stdout.toString() + listing.stderr.toString()), gpu.adapter.name, gpu.adapter.deviceLocalBytes / MiB);
  if (!match) {
    lock.release();
    throw new Error(`llama.cpp does not list a device named like ${gpu.adapter.name}`);
  }
  device = match.name;
}

const model = modelsLock.models[fit.tier.modelId]!;
const server = new LlamaServer({
  executable,
  modelPath: modelFilePath(paths.models, fit.tier.modelId, model.files[0]!.path),
  device,
  contextPerSlot,
  parallel: 1,
  threads: llmThreads,
  port: findFreePort(),
  apiKey: crypto.randomUUID(),
  chatTemplateFile: null,
}, join(paths.logs, `llama-server-${Date.now()}.log`), {
  onSpawn: (pid) => monitor.ownPids.add(pid),
  onExit: (pid) => monitor.ownPids.delete(pid),
});

const abort = new AbortController();
monitor.onState((state) => {
  if (state.assessment.light === "red" && !abort.signal.aborted) {
    console.error(`红灯，停止翻译并卸载模型：${state.assessment.reasons.map((reason) => lightReasonZh[reason]).join("；")}`);
    abort.abort();
    void server.stop();
  }
});

try {
  if (gpu) monitor.activeLuids.add(gpu.adapter.luid);
  monitor.start();
  console.log(`加载 ${fit.tier.id} ${fit.tier.label}（${device}）…`);
  await server.start(loadTimeoutMs);
  if (gpu) monitor.markLoaded(gpu.adapter.luid);

  const client = createChatClient(server.baseUrl, server.apiKey);
  const cliff = new ThroughputCliffDetector();
  const complete: CompleteFn = async (messages, schema, maxTokens, seed) => {
    cliff.reset();
    try {
      return await client.complete({ messages, schema, maxTokens, seed }, {
        timeoutMs: requestTimeoutMs,
        signal: abort.signal,
        onTokenRate: (atMs, rate) => {
          monitor.throughputCliff = cliff.add(atMs, rate);
        },
      });
    } finally {
      monitor.throughputCliff = false;
    }
  };

  const modelSha = model.files[0]!.sha256;
  const glossary = await buildGlossary(pages.flatMap((page) => page.lines), language, complete, modelSha);
  console.log(`人物与名词：${glossary.terms.length} 个（跳过 ${glossary.skippedChunks} 块，未定 ${glossary.unfixed} 个，冲突 ${glossary.conflicts.length} 处）`);
  mkdirSync(join(run, "translations"), { recursive: true });
  writeFileSync(join(run, "translations", "glossary.json"), JSON.stringify(glossary, null, 1));

  const results = await translateVolume(pages, glossary.terms, glossary.glossary.roleTable, glossary.glossary.sha256, language, complete, modelSha, historyBudget);
  for (const result of results) {
    writeFileSync(join(run, "translations", `${String(result.page).padStart(4, "0")}.json`), JSON.stringify(result));
  }
  const flagged = results.reduce((sum, result) => sum + Object.keys(result.flags).length, 0);
  console.log(`完成：${results.length} 页，${results.reduce((sum, result) => sum + result.units.length, 0)} 句，需要看看 ${flagged} 句，请求 ${results.reduce((sum, result) => sum + result.requests, 0)} 次`);
} catch (error) {
  // A red light stops the server on purpose; the aborted request is the expected result.
  if (!abort.signal.aborted) throw error;
} finally {
  monitor.stop();
  await server.stop();
  lock.release();
  probe.close();
}
