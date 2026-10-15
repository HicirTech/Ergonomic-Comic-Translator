import { describe, expect, it } from "bun:test";
import { join } from "path";
import { dataPaths } from "../../src/core/data-paths.ts";
import { huggingFaceEndpoint, modelDownloadItems, parseModelsLock, readModelsLock, readRuntimesLock } from "../../src/models/lock.ts";
import { modelPacks } from "../../src/models/packs.ts";

const validModel = {
  role: "test",
  repo: "org/name",
  revision: "a".repeat(40),
  license: "apache-2.0",
  files: [{ path: "onnx/model.onnx", size: 10, sha256: "b".repeat(64) }],
};

describe("models.lock.json", () => {
  it("pins permissive models and OFL fonts, non-commercial models only as the Japanese translator, share-alike data only as a dictionary", () => {
    const lock = readModelsLock();
    for (const [id, model] of Object.entries(lock.models)) {
      if (model.license === "cc-by-nc-sa-4.0") expect(modelPacks["llm-ja"]).toContain(id);
      else if (model.license === "cc-by-sa-4.0") expect(modelPacks.dictionary).toContain(id);
      else expect(["apache-2.0", "mit", "ofl-1.1"]).toContain(model.license);
    }
  });

  it("covers the week-1 vision pack", () => {
    const lock = readModelsLock();
    for (const id of ["detector", "ppocr-det-server", "ppocr-rec-server", "textline-ori", "manga-ocr", "manga-ocr-vocab", "baberu-ocr", "lama-manga", "migan"]) {
      expect(lock.models[id]).toBeDefined();
    }
  });

  it("puts every model of the vision pack in the lock", () => {
    const lock = readModelsLock();
    for (const id of modelPacks.vision!) expect(lock.models[id]).toBeDefined();
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

  it("fetches GitHub-hosted assets from raw.githubusercontent.com", () => {
    const lock = parseModelsLock({ version: 1, models: { f: { ...validModel, source: "github" } } });
    const [item] = modelDownloadItems(lock, ["f"], dataPaths("/data"), "https://hf-mirror.example");
    expect(item!.url).toBe(`https://raw.githubusercontent.com/org/name/${"a".repeat(40)}/onnx/model.onnx`);
    expect(() => parseModelsLock({ version: 1, models: { f: { ...validModel, source: "ftp" } } })).toThrow("source");
  });

  it("fetches a release asset from its GitHub release, tag and name encoded", () => {
    const asset = { ...validModel, source: "github-release" as const, revision: "1.0+2", files: [{ path: "dict-1.0+2.json.zip", size: 1, sha256: "b".repeat(64) }] };
    const lock = parseModelsLock({ version: 1, models: { d: asset } });
    const [item] = modelDownloadItems(lock, ["d"], dataPaths("/data"));
    expect(item!.url).toBe("https://github.com/org/name/releases/download/1.0%2B2/dict-1.0%2B2.json.zip");
    expect(() => parseModelsLock({ version: 1, models: { d: { ...asset, revision: "v 1" } } })).toThrow("release tag");
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
