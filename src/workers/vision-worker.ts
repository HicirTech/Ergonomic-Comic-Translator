// Vision worker process (G on a GPU execution provider, C on the CPU). Runs ONNX Runtime outside the
// main process so a native crash or a hung run only costs this child. Started by WorkerSupervisor.
import { preloadOnnxRuntime } from "../ort/preload.ts";
import { describeEp, sessionOptionsFor } from "../ort/session-options.ts";
import type { LoadResult, VisionEngine } from "./interfaces/index.ts";
import { visionEngineFactories } from "./vision-engines.ts";
import { serveWorker } from "./worker-loop.ts";

const runtime = preloadOnnxRuntime();
const ort = await import("onnxruntime-node");
const engines = new Map<string, VisionEngine>();

const engineError = (code: string, message: string) => Object.assign(new Error(message), { code });

serveWorker({ ortVersion: runtime.version, ortDllPath: runtime.dllPath }, async (request) => {
  switch (request.kind) {
    case "ping":
      return "pong";
    case "load": {
      const factory = visionEngineFactories[request.engine];
      if (!factory) {
        throw engineError("ENGINE_UNKNOWN", `Unknown engine ${request.engine}`);
      }
      await engines.get(request.engine)?.release();
      engines.delete(request.engine);
      const engine = factory();
      const started = performance.now();
      const io = await engine.load(ort, request.modelsRoot, sessionOptionsFor(request.ep));
      engines.set(request.engine, engine);
      return { engine: request.engine, ep: describeEp(request.ep), loadMs: performance.now() - started, ...io } satisfies LoadResult;
    }
    case "task": {
      const engine = engines.get(request.engine);
      if (!engine) {
        throw engineError("ENGINE_NOT_LOADED", `Engine ${request.engine} is not loaded`);
      }
      return engine.run(request.task);
    }
    case "unload": {
      await engines.get(request.engine)?.release();
      engines.delete(request.engine);
      return null;
    }
  }
});
