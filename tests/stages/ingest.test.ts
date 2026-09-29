import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { zipSync } from "fflate";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { ingestEntries } from "../../src/stages/ingest/ingest.ts";
import { IngestLimitError } from "../../src/stages/ingest/ingest-limit-error.ts";
import { readSources } from "../../src/stages/ingest/read-sources.ts";

/** A small solid-colour PNG, distinct per `shade`. */
const png = async (shade: number, width = 8, height = 12) =>
  new Uint8Array(await sharp(Buffer.alloc(width * height * 3, shade), { raw: { width, height, channels: 3 } }).png().toBuffer());

let root = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ct-ingest-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("ingest", () => {
  it("orders pages naturally, keeps identical images once and reports what it skipped", async () => {
    const archive = join(root, "volume.cbz");
    writeFileSync(archive, zipSync({
      "vol/10.png": await png(10),
      "vol/2.png": await png(2),
      "vol/1.png": await png(1),
      "vol/99.png": await png(1),
      "vol/notes.txt": new TextEncoder().encode("hello"),
      "__MACOSX/vol/._1.png": new Uint8Array([0, 1]),
      "vol/broken.png": new Uint8Array([1, 2, 3]),
    }));
    const { pages, skipped } = await ingestEntries(await readSources([archive]), join(root, "pages"));
    expect(pages.map((page) => [page.ordinal, page.displayName, page.width, page.height])).toEqual([
      [1, "vol/1.png", 8, 12],
      [2, "vol/2.png", 8, 12],
      [3, "vol/10.png", 8, 12],
    ]);
    expect(skipped).toEqual(expect.arrayContaining([
      { name: "vol/99.png", reason: "duplicate" },
      { name: "vol/notes.txt", reason: "unsupported_type" },
      { name: "__MACOSX/vol/._1.png", reason: "unsupported_type" },
      { name: "vol/broken.png", reason: "undecodable" },
    ]));
    expect(existsSync(pages[0]!.storedPath)).toBe(true);
    expect(pages[0]!.storedPath.endsWith(`${pages[0]!.sha256}.png`)).toBe(true);
  });

  it("reads folders recursively with /-separated names", async () => {
    const folder = join(root, "folder");
    mkdirSync(join(folder, "ch1"), { recursive: true });
    writeFileSync(join(folder, "ch1", "p1.png"), await png(50));
    const entries = await readSources([folder]);
    expect(entries.map((entry) => entry.name)).toEqual(["ch1/p1.png"]);
  });

  it("rejects archives beyond the entry or size limits before inflating", async () => {
    const archive = join(root, "bomb.zip");
    writeFileSync(archive, zipSync({ "a.png": new Uint8Array(10), "b.png": new Uint8Array(10) }));
    await expect(readSources([archive], { maxEntries: 1, maxTotalBytes: 1e9, maxCompressionRatio: 1e9 })).rejects.toBeInstanceOf(IngestLimitError);
    const dense = join(root, "dense.zip");
    writeFileSync(dense, zipSync({ "zeros.png": new Uint8Array(1_000_000) }, { level: 9 }));
    await expect(readSources([dense], { maxEntries: 10, maxTotalBytes: 1e9, maxCompressionRatio: 50 })).rejects.toThrow("compressed");
  });
});
