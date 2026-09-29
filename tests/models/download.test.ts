import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { sha256Hex } from "../../src/core/hash.ts";
import { downloadFile } from "../../src/models/download.ts";
import type { DownloadItem } from "../../src/models/interfaces/index.ts";

const payload = new Uint8Array(200_000).map((_, index) => (index * 7919) % 251);
const requests: { path: string; range: string | null }[] = [];
let honourRange = true;

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: (request) => {
    const range = request.headers.get("range");
    requests.push({ path: new URL(request.url).pathname, range });
    const match = range && honourRange ? /^bytes=(\d+)-$/.exec(range) : null;
    if (match) {
      const start = Number(match[1]);
      return new Response(payload.slice(start), { status: 206 });
    }
    return new Response(payload);
  },
});

let root = "";
const item = (overrides: Partial<DownloadItem> = {}): DownloadItem => ({
  url: `http://127.0.0.1:${server.port}/model.onnx`,
  destination: join(root, "models", "m", "model.onnx"),
  size: payload.byteLength,
  sha256: sha256Hex(payload),
  ...overrides,
});

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ct-download-"));
});

afterEach(() => {
  requests.length = 0;
  honourRange = true;
  rmSync(join(root, "models"), { recursive: true, force: true });
});

afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("downloadFile", () => {
  it("downloads, verifies and renames into place", async () => {
    expect(await downloadFile(item())).toBe("downloaded");
    expect(new Uint8Array(readFileSync(item().destination))).toEqual(payload);
    expect(existsSync(`${item().destination}.part`)).toBe(false);
  });

  it("does not touch the network when the verified file is present", async () => {
    await downloadFile(item());
    requests.length = 0;
    expect(await downloadFile(item())).toBe("present");
    expect(requests).toEqual([]);
  });

  it("resumes a partial download with a Range request", async () => {
    await downloadFile(item());
    const target = item().destination;
    rmSync(target);
    writeFileSync(`${target}.part`, payload.slice(0, 50_000));
    requests.length = 0;
    expect(await downloadFile(item())).toBe("resumed");
    expect(requests).toEqual([{ path: "/model.onnx", range: "bytes=50000-" }]);
    expect(new Uint8Array(readFileSync(target))).toEqual(payload);
  });

  it("starts over when the server ignores Range", async () => {
    await downloadFile(item());
    const target = item().destination;
    rmSync(target);
    writeFileSync(`${target}.part`, new Uint8Array(50_000));
    honourRange = false;
    await downloadFile(item());
    expect(new Uint8Array(readFileSync(target))).toEqual(payload);
  });

  it("refuses and deletes a file whose sha256 does not match", async () => {
    const wrong = item({ sha256: "0".repeat(64) });
    await expect(downloadFile(wrong)).rejects.toThrow("sha256 mismatch");
    expect(existsSync(wrong.destination)).toBe(false);
    expect(existsSync(`${wrong.destination}.part`)).toBe(false);
  });

  it("replaces an installed file that no longer matches the lock", async () => {
    await downloadFile(item());
    writeFileSync(item().destination, new Uint8Array(10));
    expect(await downloadFile(item())).toBe("downloaded");
    expect(new Uint8Array(readFileSync(item().destination))).toEqual(payload);
  });
});
