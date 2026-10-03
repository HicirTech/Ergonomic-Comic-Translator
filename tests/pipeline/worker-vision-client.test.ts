import { describe, expect, it } from "bun:test";
import { createWorkerVisionClient, engineLanes } from "../../src/pipeline/worker-vision-client.ts";
import type { ExecutionProvider } from "../../src/workers/interfaces/index.ts";
import { visionEngineFactories } from "../../src/workers/vision-engines.ts";

interface SentRequest {
  lane: "gpu" | "cpu";
  body: { kind: string; engine?: string; task?: unknown; ep?: ExecutionProvider };
  timeoutMs: number;
}

/** Stand-ins for the two worker supervisors: they record each request and answer like a loaded engine. */
const fakeLanes = () => {
  const sent: SentRequest[] = [];
  const lane = (name: SentRequest["lane"]) => ({
    request: async (body: unknown, timeoutMs: number) => {
      const request = body as SentRequest["body"];
      sent.push({ lane: name, body: request, timeoutMs });
      return request.kind === "load" ? { engine: request.engine, ep: request.ep?.name, loadMs: 0, inputNames: [], outputNames: [] } : [[]];
    },
  });
  return { gpu: lane("gpu"), cpu: lane("cpu"), sent };
};

const gpuEp: ExecutionProvider = { name: "dml", adapterLuid: "luid" };
const region = { x0: 0, y0: 0, x1: 40, y1: 20 };

/** What a session loads, in load order. */
const sessionLoads = [
  ["gpu", "detector", "dml"],
  ["gpu", "baberu", "dml"],
  ["gpu", "migan", "dml"],
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

  it("hosts every engine of the lane table in the worker engine registry", () => {
    for (const engine of Object.keys(engineLanes)) expect(typeof visionEngineFactories[engine]).toBe("function");
    expect(engineLanes.lines).toBe("cpu");
  });
});
