import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { unzipSync } from "fflate";
import { PDFDocument, ReadingDirection } from "pdf-lib";
import sharp from "sharp";
import { exportVolume } from "../../src/export/export-volume.ts";
import { buildPdf } from "../../src/export/pdf.ts";

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#ffffff" } });

describe("buildPdf", () => {
  it("gives one page per image at its pixel size, right to left for manga, with stable bytes", async () => {
    const pages = await Promise.all([[80, 120], [60, 90]].map(async ([width, height]) => ({
      jpeg: new Uint8Array(await solid(width!, height!).jpeg().toBuffer()),
      width: width!,
      height: height!,
    })));
    const bytes = await buildPdf("卷一", pages, true);
    expect(await buildPdf("卷一", pages, true)).toEqual(bytes);

    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(document.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([[80, 120], [60, 90]]);
    expect(document.getTitle()).toBe("卷一");
    expect(document.catalog.getViewerPreferences()?.getReadingDirection()).toBe(ReadingDirection.R2L);
    expect(document.getCreationDate()).toBeUndefined();
  });

  it("keeps the default reading direction for western comics", async () => {
    const jpeg = new Uint8Array(await solid(10, 10).jpeg().toBuffer());
    const document = await PDFDocument.load(await buildPdf("t", [{ jpeg, width: 10, height: 10 }], false));
    expect(document.catalog.getViewerPreferences()?.getReadingDirection()).toBe(ReadingDirection.L2R);
  });
});

describe("exportVolume", () => {
  it("writes a CBZ and a PDF with the same pages in order", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ct-export-"));
    try {
      const pagePaths = [join(directory, "0001.png"), join(directory, "0002.png")];
      await solid(40, 60).png().toFile(pagePaths[0]!);
      await solid(30, 50).png().toFile(pagePaths[1]!);
      await exportVolume("vol", pagePaths, true, join(directory, "vol.cbz"), join(directory, "vol.pdf"));

      const entries = unzipSync(new Uint8Array(readFileSync(join(directory, "vol.cbz"))));
      expect(Object.keys(entries)).toEqual(["ComicInfo.xml", "001.png", "002.png"]);
      expect(entries["002.png"]).toEqual(new Uint8Array(readFileSync(pagePaths[1]!)));
      const pdf = await PDFDocument.load(new Uint8Array(readFileSync(join(directory, "vol.pdf"))));
      expect(pdf.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([[40, 60], [30, 50]]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
