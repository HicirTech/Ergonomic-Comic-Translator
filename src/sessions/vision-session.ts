import { resolve } from "path";
import type { DataPaths } from "../core/data-paths.ts";
import { GiB } from "../core/units.ts";
import { visionResidentBytes } from "../gov/footprint-estimate.ts";
import type { ResourceMonitor } from "../gov/resource-monitor.ts";
import { createWorkerVisionClient } from "../pipeline/worker-vision-client.ts";
import type { ExecutionProvider } from "../workers/interfaces/index.ts";
import { WorkerSupervisor } from "../workers/worker-supervisor.ts";
import { acquireGpuLock, deniedFailure, supportedAdaptersByBudget, watchRedLight } from "./gpu-access.ts";
import type { SessionOpening, VisionSession } from "./interfaces/index.ts";

/** Private memory of the two worker processes with all vision sessions (estimate until measured). */
const workersHostBytes = 1.5 * GiB;
const workerStartTimeoutMs = 60_000;
const workerEntry = resolve(import.meta.dir, "../workers/vision-worker.ts");

/**
 * Loads the vision models: admission against the governor, the GPU lock, a GPU worker (DirectML on the
 * adapter with the most room, or the CPU) and a CPU worker. A red light kills both workers at once.
 * The caller keeps `monitor` running while the session is open.
 */
export const openVisionSession = async (
  paths: DataPaths,
  monitor: ResourceMonitor,
  cpuOnly: boolean,
  purpose: string,
): Promise<SessionOpening<VisionSession>> => {
  const gpuAdapter = cpuOnly ? null : supportedAdaptersByBudget(monitor)[0]?.adapter ?? null;
  const gpuEp: ExecutionProvider = gpuAdapter ? { name: "dml", adapterLuid: gpuAdapter.luid } : { name: "cpu" };
  const decision = monitor.admit({
    label: "vision",
    adapterLuid: gpuAdapter?.luid ?? null,
    devBytes: gpuAdapter ? visionResidentBytes : 0,
    spillBytes: 0,
    hostPrivateBytes: workersHostBytes,
  });
  if (!decision.admitted) {
    return { ok: false, failure: deniedFailure(decision) };
  }
  const lock = acquireGpuLock(paths, purpose);
  if (!lock.ok) {
    return { ok: false, failure: lock.failure };
  }

  const supervisor = (name: string) => new WorkerSupervisor({
    name,
    entry: workerEntry,
    startTimeoutMs: workerStartTimeoutMs,
    onSpawn: (pid) => monitor.ownPids.add(pid),
    onExit: (pid) => monitor.ownPids.delete(pid),
  });
  const gpu = supervisor("vision-gpu");
  const cpu = supervisor("vision-cpu");
  const { client, loadAll } = createWorkerVisionClient(gpu, cpu);
  const red = watchRedLight(monitor, () => {
    gpu.kill();
    cpu.kill();
  });
  if (gpuAdapter) monitor.activeLuids.add(gpuAdapter.luid);

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    red.unsubscribe();
    if (gpuAdapter) monitor.activeLuids.delete(gpuAdapter.luid);
    await gpu.stop();
    await cpu.stop();
    lock.release();
  };
  try {
    const loads = await loadAll(paths.models, gpuEp);
    if (gpuAdapter) monitor.markLoaded(gpuAdapter.luid);
    return { ok: true, session: { client, ep: gpuEp.name, loads, signal: red.signal, close } };
  } catch (error) {
    await close();
    throw error;
  }
};
