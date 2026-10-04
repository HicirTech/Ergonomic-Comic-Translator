import { describe, expect, it } from "bun:test";
import { bubbleInside } from "../../src/stages/clean/bubble-inside.ts";
import { applyInpaint, inpaintTileSize, planInpaintTiles } from "../../src/stages/clean/inpaint-tiles.ts";
import { membraneFill } from "../../src/stages/clean/membrane-fill.ts";
import { pictureShare } from "../../src/stages/clean/picture-share.ts";
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
    expect(region.outlineMedian).toBeNull();
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

  it("grows the strokes by two pixels, whatever the line thickness, and reports the ink colour", () => {
    const rgb = page(200, 160, 250, 10, { cx: 100, cy: 80, long: 100, short: 12, angle: 0 });
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 130, 36, 0)])!;
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    // The bar covers rows 74 to 85: two rows above it are masked, the third is paper.
    expect(pageMask[72 * 200 + 100]).toBe(1);
    expect(pageMask[71 * 200 + 100]).toBe(0);
    expect(region.inkMedian).toEqual([10, 10, 10]);
  });

  it("grows over an outline drawn around the glyphs and reports its colour", () => {
    // Grey paper, a dark bar with a white edge of 4 px all around it.
    const rgb = page(200, 160, 128, 255, { cx: 100, cy: 80, long: 108, short: 20, angle: 0 });
    for (let y = 74; y < 86; y += 1) rgb.data.fill(10, (y * 200 + 50) * 3, (y * 200 + 150) * 3);
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 150, 60, 0)])!;
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    // The white edge covers rows 70 to 73 above the bar: all of it is masked, the paper above it is not.
    expect(pageMask[70 * 200 + 100]).toBe(1);
    expect(pageMask[69 * 200 + 100]).toBe(0);
    expect(region.inkMedian).toEqual([10, 10, 10]);
    expect(region.outlineMedian).toEqual([255, 255, 255]);
    expect(region.ringMedian).toEqual([128, 128, 128]);
  });

  it("does not take paper that is lighter around the text for an outline", () => {
    // The artwork is 20 levels lighter within 8 px of the text than further out: nothing is drawn there.
    const rgb = page(200, 160, 180, 200, { cx: 100, cy: 80, long: 116, short: 28, angle: 0 });
    for (let y = 74; y < 86; y += 1) rgb.data.fill(10, (y * 200 + 50) * 3, (y * 200 + 150) * 3);
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 150, 60, 0)])!;
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    // The bar covers rows 74 to 85: two rows above it are masked, the lighter paper above them is not.
    expect(pageMask[72 * 200 + 100]).toBe(1);
    expect(pageMask[71 * 200 + 100]).toBe(0);
    expect(region.outlineMedian).toBeNull();
  });

  it("masks the fill of glyphs that are drawn as an outline, and tells the ink from the outline", () => {
    // Dark paper, a white ring around a fill that is darker than the paper: only the ring stands out.
    const rgb = page(200, 160, 32, 255, { cx: 100, cy: 80, long: 108, short: 20, angle: 0 });
    for (let y = 74; y < 86; y += 1) rgb.data.fill(17, (y * 200 + 50) * 3, (y * 200 + 150) * 3);
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 150, 60, 0)])!;
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    expect(pageMask[80 * 200 + 100]).toBe(1);
    expect(pageMask[71 * 200 + 100]).toBe(1);
    expect(pageMask[66 * 200 + 100]).toBe(0);
    expect(region.inkMedian).toEqual([17, 17, 17]);
    expect(region.outlineMedian).toEqual([255, 255, 255]);
    expect(region.ringMedian).toEqual([32, 32, 32]);
  });

  it("reads the paper from the line's own rectangle when the text sits on a plate", () => {
    // Light page, a dark plate barely larger than the line rectangle, light text on the plate.
    const rgb = page(200, 160, 220, 240, { cx: 100, cy: 80, long: 100, short: 12, angle: 0 });
    for (let y = 58; y < 102; y += 1) {
      for (let x = 30; x < 170; x += 1) {
        if (rgb.data[(y * 200 + x) * 3] !== 240) rgb.data.fill(30, (y * 200 + x) * 3, (y * 200 + x) * 3 + 3);
      }
    }
    const region = regionTextMask(rgb, rgbToGray(rgb), [line(100, 80, 130, 36, 0)])!;
    const pageMask = new Uint8Array(200 * 160);
    addToPageMask(pageMask, 200, region);
    expect(pageMask[80 * 200 + 100]).toBe(1);
    expect(pageMask[66 * 200 + 100]).toBe(0);
    expect(region.inkMedian).toEqual([240, 240, 240]);
    expect(region.ringMedian).toEqual([30, 30, 30]);
  });

  /** A text bar in a line rectangle that ends at x = 175, with a 4 px dot at each given x on the line's axis. */
  const withDots = (dotXs: number[]) => {
    const rgb = page(400, 160, 250, 10, { cx: 110, cy: 80, long: 120, short: 14, angle: 0 });
    for (const dotX of dotXs) {
      for (let y = 78; y < 82; y += 1) rgb.data.fill(10, (y * 400 + dotX - 2) * 3, (y * 400 + dotX + 2) * 3);
    }
    return rgb;
  };
  const textLine = line(110, 80, 130, 30, 0);
  const maskOf = (rgb: ReturnType<typeof page>, bubble: Parameters<typeof regionTextMask>[3] = null) => {
    const pageMask = new Uint8Array(rgb.width * rgb.height);
    addToPageMask(pageMask, rgb.width, regionTextMask(rgb, rgbToGray(rgb), [textLine], bubble)!);
    return pageMask;
  };

  it("takes the dot leader past a line end, but not a blob far from it or a stroke that runs on", () => {
    const rgb = withDots([190, 210, 230, 285]);
    // A bubble outline: a dark vertical stroke through the whole page, between the leader and the far blob.
    for (let y = 0; y < 160; y += 1) rgb.data.fill(10, (y * 400 + 249) * 3, (y * 400 + 252) * 3);
    const pageMask = maskOf(rgb);
    for (const dotX of [190, 210, 230]) expect(pageMask[80 * 400 + dotX]).toBe(1);
    // 53 px past the last dot: more than 1.2 line thicknesses, so it does not continue the leader.
    expect(pageMask[80 * 400 + 285]).toBe(0);
    expect(pageMask[80 * 400 + 250]).toBe(0);
  });

  it("leaves a bubble outline that hugs the text, outside the line rectangle and along its edge", () => {
    // An ellipse outline of 3 px in the text's ink, exactly as wide as the line rectangle.
    const rgb = page(400, 200, 250, 10, { cx: 200, cy: 100, long: 160, short: 14, angle: 0 });
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 400; x += 1) {
        const outer = ((x + 0.5 - 200) / 115) ** 2 + ((y + 0.5 - 100) / 40) ** 2;
        const inner = ((x + 0.5 - 200) / 112) ** 2 + ((y + 0.5 - 100) / 37) ** 2;
        if (outer <= 1 && inner > 1) rgb.data.fill(10, (y * 400 + x) * 3, (y * 400 + x) * 3 + 3);
      }
    }
    const pageMask = new Uint8Array(400 * 200);
    addToPageMask(pageMask, 400, regionTextMask(rgb, rgbToGray(rgb), [line(200, 100, 230, 40, 0)], { x0: 80, y0: 55, x1: 320, y1: 145 })!);
    expect(pageMask[100 * 400 + 200]).toBe(1);
    // The outline runs along the rectangle's ends (x = 86 and x = 313 on the text's row) and above it (y = 61).
    expect(pageMask[100 * 400 + 86]).toBe(0);
    expect(pageMask[100 * 400 + 313]).toBe(0);
    expect(pageMask[61 * 400 + 200]).toBe(0);
  });

  it("leaves a blob of another colour beside the line: marks are set in the line's ink", () => {
    const rgb = withDots([190]);
    // As dark as the text, but purple: a piece of art lettering.
    for (let y = 78; y < 82; y += 1) {
      for (let x = 208; x < 212; x += 1) rgb.data.set([44, 18, 52], (y * 400 + x) * 3);
    }
    const pageMask = maskOf(rgb);
    expect(pageMask[80 * 400 + 190]).toBe(1);
    expect(pageMask[80 * 400 + 210]).toBe(0);
  });

  it("looks for marks only inside the bubble", () => {
    const pageMask = maskOf(withDots([190, 210, 230]), { x0: 30, y0: 40, x1: 200, y1: 120 });
    expect(pageMask[80 * 400 + 190]).toBe(1);
    expect(pageMask[80 * 400 + 210]).toBe(0);
    expect(pageMask[80 * 400 + 230]).toBe(0);
  });

  it("leaves what lies along the bubble's edge: its outline and ornaments are not marks", () => {
    // The bubble is 80 px high, so its frame is the outer 4 px. The second dot reaches into it.
    const pageMask = maskOf(withDots([186, 196]), { x0: 30, y0: 40, x1: 200, y1: 120 });
    expect(pageMask[80 * 400 + 186]).toBe(1);
    expect(pageMask[80 * 400 + 196]).toBe(0);
  });

  it("follows a long leader further inside a bubble than on open artwork", () => {
    // The line ends at x = 175 and is 30 px thick: on artwork marks end 120 px past it, in a bubble 180 px.
    const leader = [190, 210, 230, 250, 270, 290, 310, 330];
    const inBubble = maskOf(withDots(leader), { x0: 10, y0: 20, x1: 395, y1: 140 });
    for (const dotX of leader) expect(inBubble[80 * 400 + dotX]).toBe(1);
    const onArtwork = maskOf(withDots(leader));
    expect(onArtwork[80 * 400 + 270]).toBe(1);
    expect(onArtwork[80 * 400 + 310]).toBe(0);
  });

  it("takes a row of dots set as a line of its own in a bubble, and leaves it on open artwork", () => {
    // The dots sit 34 px above the axis of the text: the next line position, which the line detector missed.
    const rgb = page(400, 200, 250, 10, { cx: 110, cy: 120, long: 120, short: 14, angle: 0 });
    for (const dotX of [70, 90, 110]) {
      for (let y = 84; y < 88; y += 1) rgb.data.fill(10, (y * 400 + dotX - 2) * 3, (y * 400 + dotX + 2) * 3);
    }
    const maskWith = (bubble: Parameters<typeof regionTextMask>[3]) => {
      const pageMask = new Uint8Array(400 * 200);
      addToPageMask(pageMask, 400, regionTextMask(rgb, rgbToGray(rgb), [line(110, 120, 130, 30, 0)], bubble)!);
      return pageMask;
    };
    const inBubble = maskWith({ x0: 20, y0: 40, x1: 380, y1: 190 });
    for (const dotX of [70, 90, 110]) expect(inBubble[86 * 400 + dotX]).toBe(1);
    expect(maskWith(null)[86 * 400 + 90]).toBe(0);
  });

  it("leaves the frame of a bubble that the line rectangle reaches over, and takes the text", () => {
    // A box of 320 x 100 px with a frame line of 3 px along its top edge, and a line rectangle taller than the box.
    const rgb = page(400, 220, 250, 10, { cx: 200, cy: 110, long: 160, short: 14, angle: 0 });
    for (let y = 60; y < 63; y += 1) rgb.data.fill(10, (y * 400 + 40) * 3, (y * 400 + 360) * 3);
    const pageMask = new Uint8Array(400 * 220);
    addToPageMask(pageMask, 400, regionTextMask(rgb, rgbToGray(rgb), [line(200, 100, 230, 110, 0)], { x0: 40, y0: 60, x1: 360, y1: 160 })!);
    expect(pageMask[110 * 400 + 200]).toBe(1);
    // The frame under the rectangle (x 85 to 314) is no more text than the frame beside it.
    expect(pageMask[61 * 400 + 200]).toBe(0);
    expect(pageMask[61 * 400 + 100]).toBe(0);
  });

  it("takes a mark beyond the bubble's box when it is no larger than a glyph", () => {
    // The detector's box ends at x = 250, before the last mark of the line.
    const rgb = page(400, 200, 250, 10, { cx: 150, cy: 100, long: 160, short: 14, angle: 0 });
    for (let y = 90; y < 110; y += 1) rgb.data.fill(10, (y * 400 + 262) * 3, (y * 400 + 268) * 3);
    const pageMask = new Uint8Array(400 * 200);
    addToPageMask(pageMask, 400, regionTextMask(rgb, rgbToGray(rgb), [line(170, 100, 230, 40, 0)], { x0: 40, y0: 60, x1: 250, y1: 140 })!);
    expect(pageMask[100 * 400 + 150]).toBe(1);
    expect(pageMask[100 * 400 + 265]).toBe(1);
  });

  it("takes the whole of a glyph that sticks out of its line, also when the region holds short stray lines", () => {
    // A 50 px line whose last glyph is set larger: it reaches 30 px past the rectangle's end and 5 px above it.
    const rgb = page(400, 200, 250, 10, { cx: 150, cy: 100, long: 200, short: 20, angle: 0 });
    for (let y = 70; y < 125; y += 1) rgb.data.fill(10, (y * 400 + 250) * 3, (y * 400 + 290) * 3);
    // Two stray lines on blank paper: by count they are most of the region, by length next to nothing.
    const lines = [line(150, 100, 220, 50, 0), line(120, 170, 20, 20, 0), line(200, 30, 20, 18, 0)];
    const pageMask = new Uint8Array(400 * 200);
    addToPageMask(pageMask, 400, regionTextMask(rgb, rgbToGray(rgb), lines)!);
    expect(pageMask[100 * 400 + 255]).toBe(1);
    expect(pageMask[100 * 400 + 285]).toBe(1);
    expect(pageMask[72 * 400 + 285]).toBe(1);
  });
});

describe("pictureShare", () => {
  const width = 200;
  const height = 60;
  /** A stroke of 100 x 12 px (x 50 to 149, rows 24 to 35) on paper given per pixel: the share at the given columns of its middle row. */
  const shareOn = (paperAt: (x: number, y: number) => number, columns: number[]) => {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data[y * width + x] = paperAt(x, y);
    const mask = new Uint8Array(width * height);
    for (let y = 24; y < 36; y += 1) mask.fill(1, y * width + 50, y * width + 150);
    const share = pictureShare({ data, width, height }, mask);
    return columns.map((x) => share[30 * width + x]);
  };

  it("finds no picture on plain paper, on a gradient and on paper grain", () => {
    expect(shareOn(() => 240, [55, 100, 145])).toEqual([0, 0, 0]);
    expect(shareOn((x) => 40 + x, [55, 100, 145])).toEqual([0, 0, 0]);
    // Grain of 12 levels either way, without any shape in it.
    expect(shareOn((x, y) => 200 + ((x * 7919 + y * 104729 + x * y * 31) % 25) - 12, [55, 100, 145])).toEqual([0, 0, 0]);
  });

  it("finds the picture where a line or an edge meets the stroke, and only there", () => {
    // A dark line three pixels wide crosses the stroke near its left end.
    expect(shareOn((x) => (Math.abs(x - 60) <= 1 ? 60 : 230), [60, 100, 145])).toEqual([1, 0, 0]);
    // The paper changes tone along an edge that crosses the stroke near its right end.
    expect(shareOn((x) => (x < 140 ? 150 : 210), [55, 100, 140])).toEqual([0, 0, 1]);
  });

  it("finds the picture all along a stroke on screentone", () => {
    // Dots of two pixels on a pitch of four.
    expect(shareOn((x, y) => (x % 4 < 2 && y % 4 < 2 ? 120 : 230), [55, 100, 145])).toEqual([1, 1, 1]);
  });

  it("is zero outside the mask", () => {
    const data = new Uint8Array(width * height).map((_, index) => (index % 4 < 2 ? 120 : 230));
    const mask = new Uint8Array(width * height);
    mask[30 * width + 100] = 1;
    const share = pictureShare({ data, width, height }, mask);
    expect(share.filter((value) => value > 0)).toHaveLength(1);
  });
});
describe("bubbleInside", () => {
  const width = 400;
  const height = 200;
  /** A box of paper from x 100 to 299 and y 40 to 159 on a page of tone 120, with a dark frame of 2 px when asked. */
  const boxOn = (framed: boolean, paperAt: (x: number) => number = () => 230) => {
    const data = new Uint8Array(width * height).fill(120);
    for (let y = 40; y < 160; y += 1) {
      for (let x = 100; x < 300; x += 1) data[y * width + x] = framed && (x < 102 || x >= 298 || y < 42 || y >= 158) ? 20 : paperAt(x);
    }
    return { data, width, height };
  };
  const text = { x0: 110, y0: 80, x1: 280, y1: 120 };

  it("cuts the detector's box, which also holds the tail, back to the bubble's frame", () => {
    expect(bubbleInside(boxOn(true), text, { x0: 70, y0: 40, x1: 300, y1: 160 })).toEqual({ x0: 102, y0: 42, x1: 298, y1: 158 });
  });

  it("ends where the paper ends when the bubble has no frame, and at the detector's box on plain paper", () => {
    expect(bubbleInside(boxOn(false), text, { x0: 70, y0: 30, x1: 330, y1: 170 })).toEqual({ x0: 100, y0: 40, x1: 300, y1: 160 });
    expect(bubbleInside(boxOn(false), text, { x0: 104, y0: 44, x1: 290, y1: 150 })).toEqual({ x0: 104, y0: 44, x1: 290, y1: 150 });
  });

  it("does not take artwork that shows through the box for its frame", () => {
    // The paper darkens by 100 levels over 50 px beside the text: no edge, however far the tone moves.
    const shaded = boxOn(false, (x) => (x < 110 ? 230 - 2 * (110 - x) : 230));
    expect(bubbleInside(shaded, text, { x0: 104, y0: 44, x1: 290, y1: 150 }).x0).toBe(104);
  });

  it("keeps the detector's side where the text reaches past the box", () => {
    expect(bubbleInside(boxOn(false), text, { x0: 104, y0: 44, x1: 260, y1: 150 }).x1).toBe(260);
  });
});

describe("membraneFill", () => {
  it("restores a gradient under the mask and touches nothing outside it", () => {
    const width = 60;
    const height = 40;
    const data = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) data.fill(40 + 3 * x, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
    const truth = data.slice();
    const mask = new Uint8Array(width * height);
    for (let y = 15; y < 25; y += 1) {
      for (let x = 20; x < 40; x += 1) {
        mask[y * width + x] = 1;
        data.fill(0, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
    membraneFill({ data, width, height }, mask);
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index]) expect(Math.abs(data[index * 3]! - truth[index * 3]!)).toBeLessThanOrEqual(2);
      else expect(data[index * 3]).toBe(truth[index * 3]!);
    }
  });

  it("fills a hole at the page corner from the pixels that exist", () => {
    const data = new Uint8Array(4 * 4 * 3).fill(200);
    const mask = new Uint8Array(16);
    mask[0] = 1;
    data.fill(0, 0, 3);
    membraneFill({ data, width: 4, height: 4 }, mask);
    expect([...data.subarray(0, 3)]).toEqual([200, 200, 200]);
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
