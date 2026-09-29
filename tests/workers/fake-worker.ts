// Test double for a worker process: speaks the real protocol without loading ONNX Runtime.
import { serveWorker } from "../../src/workers/worker-loop.ts";

serveWorker({ ortVersion: "fake", ortDllPath: null }, async (request) => {
  if (request.kind !== "task") {
    return { kind: request.kind };
  }
  const task = request.task as { action: "echo" | "sleep" | "fail" | "crash"; value?: unknown; ms?: number };
  switch (task.action) {
    case "echo":
      return task.value;
    case "sleep":
      await Bun.sleep(task.ms ?? 0);
      return "slept";
    case "fail":
      throw Object.assign(new Error("engine refused"), { code: "ENGINE_REFUSED" });
    case "crash":
      process.exit(3);
  }
});
