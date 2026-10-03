import { describe, expect, it } from "bun:test";
import type * as Ort from "onnxruntime-node";
import { modelFilePath } from "../../src/models/lock.ts";
import { visionEngineFactories } from "../../src/workers/vision-engines.ts";

/** An ONNX Runtime stand-in that only records which model file each session was created from. */
const fakeRuntime = () => {
  const created: string[] = [];
  const runtime = {
    InferenceSession: {
      create: async (path: string) => {
        created.push(path);
        return { inputNames: ["x"], outputNames: ["probability"], release: async () => {} };
      },
    },
  } as unknown as typeof Ort;
  return { runtime, created };
};

type LineEngineCase = [engine: string, modelId: string];

describe("line engines", () => {
  const cases: LineEngineCase[] = [
    ["lines", "ppocr-det-mobile"],
    ["lines-server", "ppocr-det-server"],
  ];

  for (const [engineName, modelId] of cases) {
    it(`loads ${modelId} for the ${engineName} engine and nothing else`, async () => {
      const { runtime, created } = fakeRuntime();
      const engine = visionEngineFactories[engineName]!();

      const io = await engine.load(runtime, "models-root", {});

      expect(created).toEqual([modelFilePath("models-root", modelId, "inference.onnx")]);
      expect(io).toEqual({ inputNames: ["x"], outputNames: ["probability"] });
      await engine.release();
    });
  }
});
