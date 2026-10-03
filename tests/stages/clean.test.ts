import { describe, expect, it } from "bun:test";
import { canFlatFill, flatFill } from "../../src/stages/clean/flat-fill.ts";
import { applyInpaint, inpaintTileSize, planInpaintTiles } from "../../src/stages/clean/inpaint-tiles.ts";
import { rgbToGray } from "../../src/imaging/gray.ts";
import { addToPageMask, regionTextMask } from "../../src/stages/mask/text-mask.ts";
import { line } from "./fixtures.ts";

/** A page of `paper` colour with a dark (or light) bar of "text" drawn along a tilted line. */
const page = (width: number, height: number, paper: number, ink: number, bar: { cx: number; cy: number; long: number; short: number; angle: number }, noise = 0) => {
  const data = new Uint8Array(width * height * 3);
  const radians = (bar.angle * Math.PI) / 180;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - bar.cx;
      const dy = y + 0.5 - bar.cy;
      const along = dx * Math.cos(radians) + dy * Math.sin(radians);
      const across = -dx * Math.sin(radians) + dy * Math.cos(radians);
      const inBar = Math.abs(along) <= bar.long / 2 && Math.abs(across) <= bar.short / 2;
      const value = inBar ? ink : paper + (noise ? ((x * 7 + y * 13) % (2 * noise)) - noise : 0);
      data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return { data, width, height };
};

describe("regionTextMask", () => {
  it("masks dark strokes on light paper inside a tilted line and measures the paper", () => {
    const bar = { cx: 100, cy: 80, long: 100, short: 12, angle: 20 };
    const rgb = page(200, 160, 250, 10, bar);
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 130, 36, 20)])!;
    expect(region.strokePixels).toBeGreaterThan(100 * 12 * 0.9);
    expect(region.strokePixels).toBeLessThan(130 * 36);
    expect(region.ringMedian).toEqual([250, 250, 250]);
    expect(region.ringStd).toBe(0);
    expect(canFlatFill(region)).toBe(true);
  });

  it("handles light text on a dark box", () => {
    const rgb = page(200, 160, 20, 240, { cx: 100, cy: 80, long: 100, short: 12, angle: 0 });
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 130, 36, 0)])!;
    expect(region.ringMedian).toEqual([20, 20, 20]);
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    expect(pageMask[80 * 200 + 100]).toBe(1);
    expect(pageMask[10 * 200 + 10]).toBe(0);
  });

  it("masks each line against its own paper when one region holds dark and light text", () => {
    // Left half: light paper with a dark bar. Right half: a dark box with a light bar.
    const width = 400;
    const height = 120;
    const data = new Uint8Array(width * height * 3).fill(245);
    const set = (x0: number, y0: number, x1: number, y1: number, value: number) => {
      for (let y = y0; y < y1; y += 1) data.fill(value, (y * width + x0) * 3, (y * width + x1) * 3);
    };
    set(200, 0, 400, 120, 25);
    set(40, 54, 160, 66, 15);
    set(240, 54, 360, 66, 235);
    const rgb = { data, width, height };
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 60, 150, 36, 0), line(300, 60, 150, 36, 0)])!;
    const pageMask = new Uint8Array(width * height);
    addToPageMask(pageMask, width, region);
    expect(pageMask[60 * width + 100]).toBe(1);
    expect(pageMask[60 * width + 300]).toBe(1);
    // Paper inside each line polygon stays: light on the left, dark on the right.
    expect(pageMask[46 * width + 100]).toBe(0);
    expect(pageMask[46 * width + 300]).toBe(0);
  });

  it("sends textured paper to inpainting instead of a flat fill", () => {
    const rgb = page(200, 160, 128, 0, { cx: 100, cy: 80, long: 100, short: 12, angle: 0 }, 30);
    expect(canFlatFill(regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 130, 36, 0)])!)).toBe(false);
  });
});

describe("flatFill", () => {
  it("restores plain paper and touches nothing outside the mask", () => {
    const rgb = page(200, 160, 250, 10, { cx: 100, cy: 80, long: 100, short: 12, angle: 0 });
    const before = rgb.data.slice();
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 130, 36, 0)])!;
    flatFill(rgb, region);
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    for (let index = 0; index < pageMask.length; index += 1) {
      if (!pageMask[index]) expect(rgb.data[index * 3]).toBe(before[index * 3]!);
    }
    expect(rgb.data[(80 * 200 + 100) * 3]).toBe(250);
  });
});

describe("inpaint tiles", () => {
  it("plans one tile per masked 256 px cell with context, clamped to the page", () => {
    const width = 1280;
    const height = 900;
    const mask = new Uint8Array(width * height);
    mask[10 * width + 10] = 1;
    mask[600 * width + 700] = 1;
    const tiles = planInpaintTiles(mask, width, height);
    expect(tiles).toEqual([
      // at the page corner the tile cannot extend left or up
      { x: 0, y: 0, cellX: 0, cellY: 0, cellWidth: 256, cellHeight: 256 },
      // (700, 600) lies in the cell at (512, 512); the tile adds 128 px on every side
      { x: 384, y: 384, cellX: 512, cellY: 512, cellWidth: 256, cellHeight: 256 },
    ]);
  });

  it("changes only masked pixels, even where tiles overlap", async () => {
    const width = 700;
    const height = 600;
    const rgb = { data: new Uint8Array(width * height * 3).fill(100), width, height };
    const mask = new Uint8Array(width * height);
    for (let y = 250; y < 270; y += 1) for (let x = 240; x < 280; x += 1) mask[y * width + x] = 1;
    const tiles = planInpaintTiles(mask, width, height);
    expect(tiles.length).toBeGreaterThan(1);
    await applyInpaint(rgb, mask, tiles, async () => new Uint8Array(inpaintTileSize * inpaintTileSize * 3).fill(7));
    for (let index = 0; index < mask.length; index += 1) {
      expect(rgb.data[index * 3]).toBe(mask[index] ? 7 : 100);
    }
  });

  it("works on pages smaller than one tile", async () => {
    const rgb = { data: new Uint8Array(300 * 200 * 3).fill(50), width: 300, height: 200 };
    const mask = new Uint8Array(300 * 200);
    mask[150 * 300 + 299] = 1;
    const tiles = planInpaintTiles(mask, 300, 200);
    expect(tiles).toEqual([{ x: 0, y: 0, cellX: 256, cellY: 0, cellWidth: 44, cellHeight: 200 }]);
    await applyInpaint(rgb, mask, tiles, async () => new Uint8Array(inpaintTileSize * inpaintTileSize * 3).fill(9));
    expect(rgb.data[(150 * 300 + 299) * 3]).toBe(9);
    expect(rgb.data[0]).toBe(50);
  });
});
