import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { dataPaths } from "../../src/core/data-paths.ts";
import { openDatabase } from "../../src/db/database.ts";
import { createVolumeStore } from "../../src/db/volumes.ts";
import { importVolume } from "../../src/jobs/import-volume.ts";
import { classifyPages } from "../../src/stages/profile/page-profile.ts";
import { makeThumbnail } from "../../src/stages/profile/thumbnail.ts";

const width = 64;
const height = 90;

const png = async (pixel: (x: number, y: number) => number) => {
  const gray = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) gray[y * width + x] = pixel(x, y);
  return new Uint8Array(await sharp(gray, { raw: { width, height, channels: 1 } }).png().toBuffer());
};

/** One picture, and the same picture with dark marks where the speech sits: two dialogue variants. */
const picture = (x: number, y: number) => ((x * 2 + y) % 200) + 30;
const withMarks = (x: number, y: number) => (x >= 5 && x < 12 && y >= 5 && y < 15 ? 0 : picture(x, y));

let root = "";
let source = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ct-import-"));
  source = join(root, "source");
  mkdirSync(source);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("importVolume", () => {
  it("stores every page as main or blank, even a near-identical pair the page profile would pair", async () => {
    writeFileSync(join(source, "1.png"), await png(picture));
    writeFileSync(join(source, "2.png"), await png(withMarks));
    writeFileSync(join(source, "3.png"), await png(() => 255));
    // The pair is real: the profile (still used by the evaluation tools) calls the later page a textless variant.
    const thumbnails = await Promise.all([1, 2, 3].map((ordinal) => makeThumbnail(join(source, `${ordinal}.png`), ordinal, width, height)));
    expect(classifyPages(thumbnails).get(2)).toEqual({ kind: "textless_variant", variantOf: 1 });

    const volumes = createVolumeStore(openDatabase(":memory:"));
    const result = await importVolume(dataPaths(join(root, "data")), volumes, [source], "pair");
    expect(result).toEqual({ volumeId: expect.any(String), pages: 3, blank: 1, skipped: [] });
    expect(volumes.pages(result.volumeId!).map((page) => [page.ordinal, page.kind, page.variant_of])).toEqual([
      [1, "main", null],
      [2, "main", null],
      [3, "blank", null],
    ]);
  });
});
