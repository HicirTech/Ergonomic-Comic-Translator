import { describe, expect, it } from "bun:test";
import { join } from "path";
import { dataPaths } from "../../src/core/data-paths.ts";
import { huggingFaceEndpoint, modelDownloadItems, parseModelsLock, readModelsLock, readRuntimesLock } from "../../src/models/lock.ts";

const validModel = {
  role: "test",
  repo: "org/name",
  revision: "a".repeat(40),
  license: "apache-2.0",
  files: [{ path: "onnx/model.onnx", size: 10, sha256: "b".repeat(64) }],
};

describe("models.lock.json", () => {
  it("is valid and pins only permissively licensed models", () => {
    const lock = readModelsLock();
    for (const model of Object.values(lock.models)) {
      expect(["apache-2.0", "mit"]).toContain(model.license);
    }
  });

  it("covers the week-1 vision pack", () => {
    const lock = readModelsLock();
    for (const id of ["detector", "ppocr-det-mobile", "ppocr-rec-server", "textline-ori", "manga-ocr", "manga-ocr-vocab", "baberu-ocr", "lama-manga", "migan"]) {
      expect(lock.models[id]).toBeDefined();
    }
  });

  it("rejects unpinned or unsafe entries", () => {
    expect(() => parseModelsLock({ version: 1, models: { m: { ...validModel, revision: "main" } } })).toThrow("revision");
    expect(() => parseModelsLock({ version: 1, models: { m: { ...validModel, files: [{ path: "../x", size: 1, sha256: "b".repeat(64) }] } } })).toThrow("unsafe");
    expect(() => parseModelsLock({ version: 1, models: { m: { ...validModel, license: "" } } })).toThrow("licence");
  });

  it("builds resolve URLs and install paths from the lock", () => {
    const lock = parseModelsLock({ version: 1, models: { m: validModel } });
    const [item] = modelDownloadItems(lock, ["m"], dataPaths("/data"), "https://hf-mirror.example");
    expect(item!.url).toBe(`https://hf-mirror.example/org/name/resolve/${"a".repeat(40)}/onnx/model.onnx`);
    expect(item!.destination).toBe(join("/data", "models", "m", "onnx", "model.onnx"));
    expect(() => modelDownloadItems(lock, ["missing"], dataPaths("/data"))).toThrow("unknown model");
  });

  it("honours HF_ENDPOINT", () => {
    expect(huggingFaceEndpoint({ HF_ENDPOINT: "https://hf-mirror.com/" })).toBe("https://hf-mirror.com");
    expect(huggingFaceEndpoint({})).toBe("https://huggingface.co");
  });
});

describe("runtimes.lock.json", () => {
  it("pins llama.cpp b11146 with checksums", () => {
    const lock = readRuntimesLock();
    expect(lock.llamaCpp.build).toBe("b11146");
    expect(lock.llamaCpp.assets["win32-x64-vulkan"]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
