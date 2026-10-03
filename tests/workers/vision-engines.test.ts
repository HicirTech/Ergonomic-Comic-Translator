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

describe("line engine", () => {
  it("loads the server line detector and nothing else", async () => {
    const { runtime, created } = fakeRuntime();
    const engine = visionEngineFactories.lines!();

    const io = await engine.load(runtime, "models-root", {});

    expect(created).toEqual([modelFilePath("models-root", "ppocr-det-server", "inference.onnx")]);
    expect(io).toEqual({ inputNames: ["x"], outputNames: ["probability"] });
    await engine.release();
  });

  it("is the only line engine a worker hosts", () => {
    expect(Object.keys(visionEngineFactories).filter((name) => name.startsWith("lines"))).toEqual(["lines"]);
  });
});
