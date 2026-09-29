import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import type { VisionClient } from "../../src/pipeline/interfaces/index.ts";
import { runVisionPage } from "../../src/pipeline/vision-page.ts";
import type { InpaintTask } from "../../src/stages/clean/interfaces/index.ts";
import type { OcrCrop } from "../../src/stages/ocr/interfaces/index.ts";
import { line } from "../stages/fixtures.ts";

const width = 400;
const height = 300;

/** White bubble (left) with two dark vertical columns; textured panel (right) with a tilted dark bar. */
const drawPage = async (path: string) => {
  const data = new Uint8Array(width * height * 3).fill(250);
  const set = (x: number, y: number, value: number) => data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 200; x < width; x += 1) set(x, y, 110 + ((x * 7 + y * 13) % 60));
  }
  for (const columnX of [120, 60]) {
    for (let y = 60; y < 220; y += 1) for (let x = columnX - 8; x < columnX + 8; x += 1) set(x, y, 15);
  }
  const radians = (25 * Math.PI) / 180;
  for (let y = 0; y < height; y += 1) {
    for (let x = 200; x < width; x += 1) {
      const along = (x - 300) * Math.cos(radians) + (y - 150) * Math.sin(radians);
      const across = -(x - 300) * Math.sin(radians) + (y - 150) * Math.cos(radians);
      if (Math.abs(along) <= 60 && Math.abs(across) <= 8) set(x, y, 10);
    }
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(path);
};

const columns = [line(120, 140, 170, 26, 90), line(60, 140, 170, 26, 90)];
const tilted = line(300, 150, 130, 26, 25);

const fakeClient = (inpaintCalls: InpaintTask[], readCalls: { engine: string; crops: OcrCrop[] }[]): VisionClient => ({
  detect: async () => ({
    width,
    height,
    detections: [
      { cls: "bubble", score: 0.95, box: { x0: 20, y0: 30, x1: 180, y1: 260 } },
      { cls: "text_bubble", score: 0.9, box: { x0: 40, y0: 50, x1: 140, y1: 230 } },
      { cls: "text_free", score: 0.85, box: { x0: 230, y0: 110, x1: 370, y1: 190 } },
    ],
  }),
  lines: async (_, regions) => (regions === null ? [[]] : regions.map((box) => (box.x0 < 200 ? columns : [tilted]))),
  recognizeLines: async (_, crops) => crops.map((crop, index) => [{
    quarterTurns: 0,
    text: ["「行くぞ。」", "「待って！」", "営業中です"][index] ?? "",
    meanProb: 0.95,
    minProb: 0.9,
    tokens: 5,
  }]),
  readUtterances: async (_, crops, engine) => {
    readCalls.push({ engine, crops });
    return crops.map((crop, index) => crop.quarterTurns.map((quarterTurns) => ({
      quarterTurns,
      text: `${engine}-${index}-${quarterTurns}`,
      meanProb: quarterTurns === 0 ? 0.95 : 0.5,
      minProb: 0.4,
      tokens: 4,
    })));
  },
  orientation: async (_, crops) => crops.map((crop) => crop.quarterTurns.map((quarterTurns) => ({ quarterTurns, upsideDown: 0.1 }))),
  inpaint: async (task) => {
    inpaintCalls.push(task);
    copyFileSync(task.imagePath, task.outputPath);
  },
});

let root = "";
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "ct-vision-"));
  await drawPage(join(root, "page.png"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("runVisionPage", () => {
  it("runs the R wave: splits speakers, searches slanted text, flat-fills plain paper and inpaints the rest", async () => {
    const inpaintCalls: InpaintTask[] = [];
    const readCalls: { engine: string; crops: OcrCrop[] }[] = [];
    const result = await runVisionPage(fakeClient(inpaintCalls, readCalls), join(root, "page.png"), "p1", root, "v");

    expect(result.regions).toHaveLength(2);
    const [bubble, sign] = result.regions;
    expect(bubble!.orientation.writingMode).toBe("v");
    expect(bubble!.utterances).toHaveLength(2);
    expect(bubble!.utterances[1]!.startReasons).toContain("close_open");
    expect(bubble!.clean).toBe("flat");
    expect(bubble!.classification).toEqual({ layout: "bubble", kind: "dialogue", policy: "translate" });

    expect(sign!.orientation.tilt).toBeCloseTo(25, 0);
    expect(sign!.clean).toBe("inpaint");
    // |tilt| >= 25 degrees: the crop is also read at +-90 degrees, and the upright reading wins.
    const baberu = readCalls.find((call) => call.engine === "baberu")!;
    expect(baberu.crops.at(-1)!.quarterTurns).toEqual([0, 1, 3]);
    expect(sign!.utterances[0]!.quarterTurns).toBe(0);

    expect(inpaintCalls).toHaveLength(1);
    expect(inpaintCalls[0]!.tiles.length).toBeGreaterThan(0);
    expect(existsSync(result.cleanedPath)).toBe(true);
    expect(Object.keys(result.timingsMs)).toEqual(expect.arrayContaining(["detect", "lines", "ocr", "inpaint"]));
  });
});
