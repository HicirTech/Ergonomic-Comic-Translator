import { describe, expect, it } from "bun:test";
import { createWorkerVisionClient, engineLanes } from "../../src/pipeline/worker-vision-client.ts";
import type { ExecutionProvider } from "../../src/workers/interfaces/index.ts";
import { visionEngineFactories } from "../../src/workers/vision-engines.ts";

interface SentRequest {
  lane: "gpu" | "cpu";
  body: { kind: string; engine?: string; task?: unknown; ep?: ExecutionProvider };
  timeoutMs: number;
}

/**
 * Stand-ins for the two worker supervisors: they record each request and answer like a loaded engine.
 * An engine named in `failing` cannot be loaded.
 */
const fakeLanes = (failing: readonly string[] = []) => {
  const sent: SentRequest[] = [];
  const lane = (name: SentRequest["lane"]) => ({
    request: async (body: unknown, timeoutMs: number) => {
      const request = body as SentRequest["body"];
      sent.push({ lane: name, body: request, timeoutMs });
      if (request.kind === "load" && failing.includes(request.engine!)) throw new Error(`${request.engine} cannot be loaded`);
      return request.kind === "load" ? { engine: request.engine, ep: request.ep?.name, loadMs: 0, inputNames: [], outputNames: [] } : [[]];
    },
  });
  return { gpu: lane("gpu"), cpu: lane("cpu"), sent };
};

const gpuEp: ExecutionProvider = { name: "dml", adapterLuid: "luid" };
const region = { x0: 0, y0: 0, x1: 40, y1: 20 };

/** What a session with a GPU loads, in load order. */
const sessionLoads = [
  ["gpu", "lama", "webgpu"],
  ["gpu", "detector", "dml"],
  ["gpu", "baberu", "dml"],
  ["cpu", "lines", "cpu"],
  ["cpu", "text-rec", "cpu"],
  ["cpu", "textline-ori", "cpu"],
  ["cpu", "manga-ocr", "cpu"],
];

describe("worker vision client", () => {
  it("serves the crop pass and the page pass from the line engine on the CPU worker", async () => {
    const { gpu, cpu, sent } = fakeLanes();
    const { client } = createWorkerVisionClient(gpu, cpu);

    await client.lines("page.png", null);
    await client.lines("page.png", [region, region]);

    expect(sent).toEqual([
      { lane: "cpu", body: { kind: "task", engine: "lines", task: { imagePath: "page.png", regions: null } }, timeoutMs: 10_000 },
      { lane: "cpu", body: { kind: "task", engine: "lines", task: { imagePath: "page.png", regions: [region, region] } }, timeoutMs: 20_000 },
    ]);
  });

  it("sends every other call to its own engine and lane", async () => {
    const { gpu, cpu, sent } = fakeLanes();
    const { client } = createWorkerVisionClient(gpu, cpu);

    await client.detect("page.png");
    await client.recognizeLines("page.png", []);
    await client.readUtterances("page.png", [], "manga-ocr");

    expect(sent.map(({ lane, body }) => [lane, body.engine])).toEqual([["gpu", "detector"], ["cpu", "text-rec"], ["cpu", "manga-ocr"]]);
  });

  it("loads every engine of the session once, GPU engines on the GPU provider", async () => {
    const { gpu, cpu, sent } = fakeLanes();
    const { loadAll } = createWorkerVisionClient(gpu, cpu);

    const loaded = await loadAll("models", gpuEp);

    expect(sent.map(({ lane, body }) => [lane, body.engine, body.ep?.name])).toEqual(sessionLoads);
    expect(loaded.map((load) => load.engine)).toEqual(sessionLoads.map(([, engine]) => engine!));
  });

  it("inpaints with LaMa where the session has a GPU, with MI-GAN where WebGPU cannot host it and on the CPU", async () => {
    const inpaintTask = { imagePath: "page.png", maskPath: "mask.bin", width: 8, height: 8, tiles: [], outputPath: "out.png" };
    const engineOf = async (lanes: ReturnType<typeof fakeLanes>, ep: ExecutionProvider) => {
      const { client, loadAll } = createWorkerVisionClient(lanes.gpu, lanes.cpu);
      const loaded = await loadAll("models", ep);
      await client.inpaint(inpaintTask);
      return { loaded: loaded.map((load) => `${load.engine}@${load.ep}`).slice(0, 2), used: lanes.sent.at(-1)!.body.engine };
    };

    expect(await engineOf(fakeLanes(), gpuEp)).toEqual({ loaded: ["lama@webgpu", "detector@dml"], used: "lama" });
    expect(await engineOf(fakeLanes(["lama"]), gpuEp)).toEqual({ loaded: ["migan@dml", "detector@dml"], used: "migan" });
    const onCpu = fakeLanes();
    expect(await engineOf(onCpu, { name: "cpu" })).toEqual({ loaded: ["migan@cpu", "detector@cpu"], used: "migan" });
    expect(onCpu.sent.some(({ body }) => body.engine === "lama")).toBe(false);
  });

  it("hosts every engine of the lane table in the worker engine registry", () => {
    for (const engine of Object.keys(engineLanes)) expect(typeof visionEngineFactories[engine]).toBe("function");
    expect(engineLanes.lines).toBe("cpu");
  });
});
