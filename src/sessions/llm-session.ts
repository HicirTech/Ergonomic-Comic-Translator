import { join } from "path";
import type { DataPaths } from "../core/data-paths.ts";
import { MiB } from "../core/units.ts";
import { hostHeadroomBytes } from "../gov/headroom.ts";
import type { ResourceMonitor } from "../gov/resource-monitor.ts";
import { ThroughputCliffDetector } from "../gov/throughput-cliff.ts";
import { fitTiers, recommendTier } from "../gov/tiers.ts";
import { createChatClient } from "../llm/chat-client.ts";
import { deviceForAdapter, parseListDevices } from "../llm/list-devices.ts";
import { findFreePort, LlamaServer } from "../llm/llama-server.ts";
import { modelFilePath, readModelsLock, readRuntimesLock } from "../models/lock.ts";
import { llamaCppDirectory } from "../models/runtime-install.ts";
import type { CompleteFn } from "../translate/interfaces/index.ts";
import { acquireGpuLock, deniedFailure, supportedAdaptersByBudget, watchRedLight } from "./gpu-access.ts";
import type { LlmSession, SessionOpening } from "./interfaces/index.ts";

const contextPerSlot = 8192;
const llmThreads = 4;
const loadTimeoutMs = 300_000;
/** A page translation (all retry rounds) may take at most this long per request. */
const requestTimeoutMs = 90_000;

/**
 * Starts llama-server with the best tier that fits: on the GPU with the most room (Vulkan), otherwise
 * on the CPU. Admission, the GPU lock and a red-light watch (which stops the server) come first; every
 * request feeds the throughput-cliff detector. The caller keeps `monitor` running while the session is open.
 */
export const openLlmSession = async (paths: DataPaths, monitor: ResourceMonitor, purpose: string): Promise<SessionOpening<LlmSession>> => {
  const host = (monitor.latest ?? monitor.tick()).sample.host;
  const hostAvailable = Math.max(0, host.availPhysBytes - hostHeadroomBytes(host.totalPhysBytes));
  const modelsLock = readModelsLock();
  const gpu = supportedAdaptersByBudget(monitor)
    .map(({ adapter, availableBytes }) => ({ adapter, fit: recommendTier(fitTiers(modelsLock, adapter.kind, availableBytes, hostAvailable)) }))
    .find((choice) => choice.fit?.tier.device === "gpu") ?? null;
  const fit = gpu?.fit ?? recommendTier(fitTiers(modelsLock, "unsupported", 0, hostAvailable));
  if (!fit) {
    return { ok: false, failure: { kind: "no_tier", messageZh: "内存不足，没有可以运行的翻译档位。" } };
  }
  const decision = monitor.admit({
    label: fit.tier.id,
    adapterLuid: gpu?.adapter.luid ?? null,
    devBytes: fit.devBytes,
    spillBytes: 0,
    hostPrivateBytes: fit.hostPrivateBytes,
  });
  if (!decision.admitted) {
    return { ok: false, failure: deniedFailure(decision) };
  }
  const lock = acquireGpuLock(paths, `${purpose} ${fit.tier.id}`);
  if (!lock.ok) {
    return { ok: false, failure: lock.failure };
  }

  const backend = gpu ? "vulkan" : "cpu";
  const executable = join(
    llamaCppDirectory(paths, readRuntimesLock(), `${process.platform}-${process.arch}-${backend}`),
    process.platform === "win32" ? "llama-server.exe" : "llama-server",
  );
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
  const red = watchRedLight(monitor, () => {
    void server.stop();
  });
  if (gpu) monitor.activeLuids.add(gpu.adapter.luid);

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    red.unsubscribe();
    if (gpu) monitor.activeLuids.delete(gpu.adapter.luid);
    await server.stop();
    lock.release();
  };
  try {
    await server.start(loadTimeoutMs);
  } catch (error) {
    await close();
    throw error;
  }
  if (gpu) monitor.markLoaded(gpu.adapter.luid);

  const client = createChatClient(server.baseUrl, server.apiKey);
  const cliff = new ThroughputCliffDetector();
  const complete: CompleteFn = async (messages, schema, maxTokens, seed) => {
    cliff.reset();
    try {
      return await client.complete({ messages, schema, maxTokens, seed }, {
        timeoutMs: requestTimeoutMs,
        signal: red.signal,
        onTokenRate: (atMs, rate) => {
          monitor.throughputCliff = cliff.add(atMs, rate);
        },
      });
    } finally {
      monitor.throughputCliff = false;
    }
  };
  return {
    ok: true,
    session: { complete, tierId: fit.tier.id, tierLabel: fit.tier.label, modelSha: model.files[0]!.sha256, device, signal: red.signal, close },
  };
};
