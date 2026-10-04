import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import type { OrientedRegion, UtteranceResult, VisionClient } from "../../src/pipeline/interfaces/index.ts";
import { cleanPage } from "../../src/pipeline/clean-page.ts";
import type { InpaintTask } from "../../src/stages/clean/interfaces/index.ts";
import { estimateOrientation } from "../../src/stages/regions/orientation.ts";
import { line } from "../stages/fixtures.ts";

const passthrough = async <T>(_name: string, work: () => Promise<T>) => work();

const utterance = (text: string): UtteranceResult => ({
  box: { x0: 0, y0: 0, x1: 1, y1: 1 },
  lineIndexes: [0],
  lineThickness: 30,
  startReasons: [],
  nameTag: false,
  thought: false,
  text,
  meanProb: 0.9,
  minProb: 0.9,
  engine: "baberu",
  textFrom: "sentence",
  quarterTurns: 0,
  flags: [],
});

describe("cleanPage", () => {
  it("creates a missing work directory before writing the flat image", async () => {
    const root = mkdtempSync(join(tmpdir(), "ct-clean-"));
    try {
      const image = join(root, "page.png");
      await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toFile(image);
      const work = join(root, "missing-work");
      const client = { inpaint: async () => {} } as unknown as VisionClient;
      const result = await cleanPage(client, image, "page", work, [], () => [], passthrough);
      expect(result.cleanedPath).toBe(join(work, "page.filled.png"));
      expect(existsSync(result.cleanedPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps lettering drawn across a bubble in another ink than its dialogue, and cleans the dialogue", async () => {
    const root = mkdtempSync(join(tmpdir(), "ct-clean-"));
    try {
      // A pale dialogue box with a line of black text and, beside it, a pale pink word with a darker rim.
      const width = 400;
      const height = 160;
      const data = new Uint8Array(width * height * 3);
      const set = (x0: number, y0: number, x1: number, y1: number, colour: [number, number, number]) => {
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data.set(colour, (y * width + x) * 3);
      };
      set(0, 0, width, height, [237, 225, 225]);
      set(150, 70, 350, 90, [10, 10, 10]);
      set(40, 64, 100, 96, [150, 120, 118]);
      set(43, 67, 97, 93, [232, 204, 201]);
      const image = join(root, "page.png");
      await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(image);
      const bubble = { x0: 10, y0: 20, x1: 390, y1: 140 };
      const regionOf = (cx: number, long: number): OrientedRegion => {
        const lines = [line(cx, 80, long, 50, 0)];
        const box = { x0: cx - long / 2, y0: 55, x1: cx + long / 2, y1: 105 };
        return { region: { box, cls: "text_bubble", score: 0.9, bubble, lines }, orientation: estimateOrientation(lines, box) };
      };
      const client = { inpaint: async () => {} } as unknown as VisionClient;
      const result = await cleanPage(client, image, "page", root, [regionOf(250, 230), regionOf(70, 90)], (index) => [utterance(index === 0 ? "ここは静かだね" : "ゆらり")], passthrough);

      expect(result.regions[0]!.classification).toEqual({ layout: "bubble", kind: "dialogue", policy: "translate" });
      expect(result.regions[0]!.clean).toBe("membrane");
      expect(result.regions[1]!.classification).toEqual({ layout: "bubble", kind: "sfx", policy: "keep" });
      expect(result.regions[1]!.clean).toBe("kept");
      const cleaned = await sharp(result.cleanedPath).raw().toBuffer();
      expect(cleaned[(80 * width + 250) * 3]).toBeGreaterThan(220);
      expect(cleaned[(80 * width + 70) * 3]).toBe(232);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("has the model fill the page as it is, and takes its fill only where the picture meets the strokes", async () => {
    const root = mkdtempSync(join(tmpdir(), "ct-clean-"));
    try {
      // Black text on paper that a drawn edge crosses at x = 150: the picture shows next to the strokes there.
      const width = 300;
      const height = 120;
      const data = new Uint8Array(width * height * 3);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.fill(x < 150 ? 150 : 215, (y * width + x) * 3, (y * width + x) * 3 + 3);
      for (let y = 54; y < 66; y += 1) data.fill(10, (y * width + 50) * 3, (y * width + 250) * 3);
      const image = join(root, "page.png");
      await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(image);
      const lines = [line(150, 60, 230, 36, 0)];
      const box = { x0: 35, y0: 42, x1: 265, y1: 78 };
      const calls: InpaintTask[] = [];
      // A model that paints every hole in one tone of its own.
      const client = {
        inpaint: async (task: InpaintTask) => {
          calls.push(task);
          const page = await sharp(task.imagePath).raw().toBuffer();
          readFileSync(task.maskPath).forEach((hole, index) => {
            if (hole) page.fill(77, index * 3, index * 3 + 3);
          });
          await sharp(page, { raw: { width, height, channels: 3 } }).png().toFile(task.outputPath);
        },
      } as unknown as VisionClient;
      const result = await cleanPage(client, image, "page", root, [{ region: { box, cls: "text_free", score: 0.9, bubble: null, lines }, orientation: estimateOrientation(lines, box) }], () => [utterance("ここは静かだね")], passthrough);

      expect(result.regions[0]!.clean).toBe("inpaint");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.imagePath).toBe(image);
      const mask = readFileSync(calls[0]!.maskPath);
      // The bar covers rows 54 to 65; the stroke mask adds two rows, the model's mask a third.
      expect(mask[51 * width + 100]).toBe(1);
      expect(mask[50 * width + 100]).toBe(0);
      const cleaned = await sharp(result.cleanedPath).raw().toBuffer();
      // At the edge the model's fill, away from it the paper of either side, and no model tone around the strokes.
      expect(cleaned[(60 * width + 150) * 3]).toBe(77);
      expect(cleaned[(60 * width + 60) * 3]).toBe(150);
      expect(cleaned[(60 * width + 240) * 3]).toBe(215);
      expect(cleaned[(51 * width + 150) * 3]).toBe(215);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
