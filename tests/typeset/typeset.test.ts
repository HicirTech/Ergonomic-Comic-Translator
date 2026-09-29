import { describe, expect, it } from "bun:test";
import { unzipSync } from "fflate";
import { buildCbz, comicInfoXml } from "../../src/export/cbz.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import { typesetPage, untranslatedPlaceholderZh } from "../../src/pipeline/typeset-page.ts";
import { pageText } from "../../src/pipeline/volume-text.ts";
import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { breakLines } from "../../src/typeset/kinsoku.ts";
import { layoutText } from "../../src/typeset/layout.ts";
import { layoutPaths, pageOverlaySvg, placedBlockSvg } from "../../src/typeset/svg.ts";

/** Every character is one glyph: CJK 1 em wide, ASCII half; vertical advances are always 1 em. */
const fakeShaper: Shaper = {
  upem: 1000,
  shape: (text, direction) => {
    const glyphs = [];
    let offset = 0;
    for (const char of text) {
      const wide = char.codePointAt(0)! > 0x2000;
      glyphs.push({
        id: char.codePointAt(0)!,
        cluster: offset,
        xAdvance: direction === "h" ? (wide ? 1000 : 500) : 0,
        yAdvance: direction === "v" ? -1000 : 0,
        xOffset: direction === "v" ? -500 : 0,
        yOffset: 0,
      });
      offset += char.length;
    }
    return glyphs;
  },
  glyphPath: (id) => `M0 0L${id % 7} 1Z`,
};

const chars = (text: string) => [...text];
const ones = (text: string) => chars(text).map(() => 1);

describe("breakLines (kinsoku)", () => {
  it("breaks greedily", () => {
    expect(breakLines(chars("一二三四五六"), ones("一二三四五六"), 4)).toEqual([0, 4]);
  });

  it("hangs closing punctuation instead of starting a line with it", () => {
    expect(breakLines(chars("一二三四。五"), ones("一二三四。五"), 4)).toEqual([0, 5]);
    expect(breakLines(chars("一二三四……五"), ones("一二三四……五"), 4)).toEqual([0, 6]);
  });

  it("never ends a line on an opening bracket", () => {
    expect(breakLines(chars("一二三「四五」"), ones("一二三「四五」"), 4)).toEqual([0, 3]);
  });
});

describe("layoutText", () => {
  it("picks the largest size whose lines fit and centres them", () => {
    const layout = layoutText(fakeShaper, "你好世界你好世界", "h", 200, 100, 12, 60);
    expect(layout.overflow).toBe(false);
    // 50 px: 4 per line, 2 lines, 2 * 50 * 1.25 - 12.5 = 112.5 > 100; 45 px: 4 per line, 2 lines = 101.25 > 100.
    expect(layout.fontSize).toBe(44);
    expect(layout.lines).toBe(2);
    const firstLineX = layout.glyphs.filter((glyph) => glyph.y === layout.glyphs[0]!.y).map((glyph) => glyph.x);
    expect(firstLineX[0]).toBeCloseTo((200 - 4 * 44) / 2, 6);
  });

  it("sets tall boxes as columns from right to left and turns dashes", () => {
    const layout = layoutText(fakeShaper, "你好——世界", "v", 60, 200, 12, 40);
    expect(layout.direction).toBe("v");
    const first = layout.glyphs[0]!;
    const last = layout.glyphs.at(-1)!;
    expect(first.x).toBeGreaterThan(last.x - 1e-9);
    expect(layout.glyphs.filter((glyph) => glyph.rotate)).toHaveLength(2);
  });

  it("reports overflow instead of cutting text", () => {
    const layout = layoutText(fakeShaper, "一".repeat(200), "h", 50, 30, 12, 20);
    expect(layout.overflow).toBe(true);
    expect(layout.fontSize).toBe(12);
    expect(layout.glyphs).toHaveLength(200);
  });
});

describe("SVG output", () => {
  it("emits one path per glyph and wraps blocks in the original angle", () => {
    const layout = layoutText(fakeShaper, "你好", "h", 100, 40, 12, 20);
    expect(layoutPaths(fakeShaper, layout).match(/<path /gu)).toHaveLength(2);
    const block = placedBlockSvg(fakeShaper, layout, { cx: 50, cy: 60, width: 100, height: 40, angle: 25 }, true);
    expect(block).toContain("rotate(25)");
    expect(block).toContain("paint-order=\"stroke\"");
    expect(pageOverlaySvg(800, 1200, [block])).toStartWith("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"1200\"");
  });
});

describe("CBZ export", () => {
  it("stores pages in order with ComicInfo.xml", () => {
    const cbz = buildCbz("测试<卷>", [{ extension: ".png", data: new Uint8Array([1]) }, { extension: ".png", data: new Uint8Array([2]) }], true);
    const entries = unzipSync(cbz);
    expect(Object.keys(entries)).toEqual(["ComicInfo.xml", "001.png", "002.png"]);
    expect(new TextDecoder().decode(entries["ComicInfo.xml"]!)).toContain("<Title>测试&lt;卷&gt;</Title>");
    expect(comicInfoXml("t", 3, false)).toContain("<Manga>No</Manga>");
  });
});

describe("typesetPage", () => {
  const vision: PageVisionResult = {
    width: 400,
    height: 600,
    regions: [{
      box: { x0: 100, y0: 100, x1: 300, y1: 300 },
      cls: "text_bubble",
      bubble: { x0: 90, y0: 90, x1: 310, y1: 310 },
      lines: [],
      orientation: { tilt: 0, consistency: 1, writingMode: "h", ambiguous: false, frame: { cx: 200, cy: 200, w: 200, h: 200, angle: 0 } },
      classification: { layout: "bubble", kind: "dialogue", policy: "translate" },
      utterances: [{
        box: { x0: 0, y0: 0, x1: 200, y1: 200 },
        lineIndexes: [],
        startReasons: [],
        nameTag: false,
        thought: false,
        text: "こんにちは",
        meanProb: 0.9,
        minProb: 0.9,
        engine: "baberu",
        quarterTurns: 0,
        flags: [],
      }],
      clean: "flat",
    }],
    uncovered: [],
    cleanedPath: "cleaned.png",
    timingsMs: {},
  };
  const text = pageText(1, vision.regions, "rtl");

  it("letters the translation into the bubble", () => {
    const { svg, overflow } = typesetPage(fakeShaper, vision, text, { page: 1, units: text.units, targets: { "1": "你好" }, flags: {}, requests: 1 });
    expect(svg.match(/<path /gu)).toHaveLength(2);
    expect(overflow).toEqual([]);
  });

  it("never leaves a cleaned bubble empty when the translation failed", () => {
    const { svg } = typesetPage(fakeShaper, vision, text, { page: 1, units: text.units, targets: {}, flags: { "1": ["G1_REFUSAL"] }, requests: 4 });
    expect(svg.match(/<path /gu)).toHaveLength([...untranslatedPlaceholderZh].length);
  });
});
