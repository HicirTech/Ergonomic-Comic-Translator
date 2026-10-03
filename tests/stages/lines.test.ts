import { describe, expect, it } from "bun:test";
import { lineAngleDistance } from "../../src/geometry/angle.ts";
import { rectCorners } from "../../src/geometry/rotated-rect.ts";
import { dbMapToPage, planDbCrop, planDbPage } from "../../src/stages/lines/db-input.ts";
import { extractTextLines } from "../../src/stages/lines/db-postprocess.ts";
import { textThickness } from "../../src/stages/lines/text-thickness.ts";
import { line } from "./fixtures.ts";

/** Paints a filled rotated rectangle of probability `value` into a map (point-in-polygon per pixel centre). */
const paintRect = (map: Float32Array, width: number, rect: { cx: number; cy: number; long: number; short: number; angle: number }, value: number) => {
  const corners = rectCorners({ center: { x: rect.cx, y: rect.cy }, long: rect.long, short: rect.short, angle: rect.angle });
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let index = 0; index < 4; index += 1) {
      const a = corners[index]!;
      const b = corners[(index + 1) % 4]!;
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cross !== 0) {
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
      }
    }
    return true;
  };
  const height = map.length / width;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inside(x + 0.5, y + 0.5)) map[y * width + x] = value;
    }
  }
};

const identity = (point: { x: number; y: number }) => point;

describe("extractTextLines", () => {
  it("recovers position and tilt of slanted lines within a degree", () => {
    for (const angle of [0, 7, -15, 30, -45, 60, 85]) {
      const width = 320;
      const map = new Float32Array(width * 240);
      paintRect(map, width, { cx: 160, cy: 120, long: 180, short: 24, angle }, 0.9);
      const [line, ...rest] = extractTextLines(map, width, 240, identity);
      expect(rest).toHaveLength(0);
      expect(lineAngleDistance(line!.rect.angle, angle)).toBeLessThan(1);
      expect(line!.rect.center.x).toBeCloseTo(160, 0);
      expect(line!.rect.center.y).toBeCloseTo(120, 0);
      expect(line!.curved).toBe(false);
    }
  });

  it("unclips the shrunk DB kernel back to the full line size", () => {
    const width = 300;
    const map = new Float32Array(width * 100);
    paintRect(map, width, { cx: 150, cy: 50, long: 200, short: 20, angle: 0 }, 0.9);
    const [line] = extractTextLines(map, width, 100, identity);
    // The painted kernel covers exactly 200 x 20 pixels.
    const distance = (200 * 20 * 1.5) / (2 * (200 + 20));
    expect(line!.rect.short).toBeCloseTo(20 + 2 * distance, 6);
    expect(line!.rect.long).toBeCloseTo(200 + 2 * distance, 6);
  });

  it("drops low-confidence blobs and slivers", () => {
    const width = 200;
    const map = new Float32Array(width * 200);
    paintRect(map, width, { cx: 60, cy: 60, long: 80, short: 20, angle: 0 }, 0.4);
    paintRect(map, width, { cx: 140, cy: 140, long: 80, short: 2, angle: 0 }, 0.95);
    expect(extractTextLines(map, width, 200, identity)).toEqual([]);
  });

  it("flags curved text whose pixels fill little of its rectangle", () => {
    const width = 240;
    const map = new Float32Array(width * 240);
    // An L-shaped stroke: two arms of one component.
    paintRect(map, width, { cx: 120, cy: 60, long: 160, short: 16, angle: 0 }, 0.9);
    paintRect(map, width, { cx: 48, cy: 130, long: 150, short: 16, angle: 90 }, 0.9);
    const [line] = extractTextLines(map, width, 240, identity);
    expect(line!.curved).toBe(true);
  });

  it("separates neighbouring lines", () => {
    const width = 200;
    const map = new Float32Array(width * 200);
    for (const cx of [40, 80, 120, 160]) paintRect(map, width, { cx, cy: 100, long: 150, short: 18, angle: 90 }, 0.9);
    expect(extractTextLines(map, width, 200, identity)).toHaveLength(4);
  });
});

describe("DB crop planning", () => {
  it("adds context, pads to the stride and maps back to page pixels", () => {
    const plan = planDbCrop({ x0: 100, y0: 200, x1: 180, y1: 400 }, 1000, 1400);
    expect(plan.box).toEqual({ x0: 92, y0: 192, x1: 188, y1: 408 });
    expect(plan.scale).toBe(1);
    expect(plan.width % 32).toBe(0);
    expect(plan.height % 32).toBe(0);
    expect(dbMapToPage(plan)({ x: plan.pad, y: plan.pad })).toEqual({ x: 92, y: 192 });
  });

  it("upscales small crops and clamps at the page edge", () => {
    const plan = planDbCrop({ x0: 0, y0: 0, x1: 20, y1: 60 }, 500, 500);
    expect(plan.box.x0).toBe(0);
    expect(plan.scale).toBe(2);
    expect(dbMapToPage(plan)({ x: plan.pad + 10, y: plan.pad + 10 })).toEqual({ x: 5, y: 5 });
  });

  it("covers a whole page without scaling", () => {
    expect(planDbPage(1280, 1807)).toMatchObject({ scale: 1, pad: 0, width: 1280, height: 1824 });
  });
});

describe("textThickness", () => {
  it("is the thickness most of the text's length is set in", () => {
    // One long line and two stray fragments: the plain median would be 25.
    expect(textThickness([line(300, 100, 470, 58, 0), line(380, 200, 25, 25, 0), line(350, 50, 23, 19, 90)])).toBe(58);
    expect(textThickness([line(100, 100, 300, 30, 0), line(100, 140, 280, 32, 0), line(100, 180, 290, 80, 0)])).toBe(32);
    expect(textThickness([])).toBeNull();
  });
});