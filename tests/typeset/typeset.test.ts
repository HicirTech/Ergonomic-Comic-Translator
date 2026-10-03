import { describe, expect, it } from "bun:test";
import { unzipSync } from "fflate";
import { buildCbz, comicInfoXml } from "../../src/export/cbz.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import { typesetPage, untranslatedPlaceholderZh } from "../../src/pipeline/typeset-page.ts";
import { pageText } from "../../src/pipeline/volume-text.ts";
import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { breakLines } from "../../src/typeset/kinsoku.ts";
import { layoutText } from "../../src/typeset/layout.ts";
import { letteringStyle, relativeLuminance } from "../../src/typeset/lettering-style.ts";
import { layoutPaths, pageOverlaySvg, placedBlockSvg } from "../../src/typeset/svg.ts";
import { line } from "../stages/fixtures.ts";

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

  it("moves a character down instead of starting a line with closing punctuation, and never passes the limit", () => {
    expect(breakLines(chars("一二三四。五"), ones("一二三四。五"), 4)).toEqual([0, 3]);
    expect(breakLines(chars("一二三四……五"), ones("一二三四……五"), 4)).toEqual([0, 3]);
    expect(breakLines(chars("一二三！？五六"), ones("一二三！？五六"), 4)).toEqual([0, 2, 6]);
  });

  it("breaks a long run of marks where it must rather than emptying the line", () => {
    expect(breakLines(chars("啊………………"), ones("啊………………"), 4)).toEqual([0, 4]);
    for (const text of ["一二三四。五", "啊………………", "一二三！？五六", "「一二」「三四」五"]) {
      const starts = breakLines(chars(text), ones(text), 4);
      starts.forEach((start, line) => expect((starts[line + 1] ?? chars(text).length) - start).toBeLessThanOrEqual(4));
    }
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
    const box = { cx: 50, cy: 60, width: 100, height: 40, angle: 25 };
    const block = placedBlockSvg(fakeShaper, layout, box, { fill: "#111111", outline: "#ffffff" });
    expect(block).toContain("rotate(25)");
    expect(block).toContain("fill=\"#111111\" stroke=\"#ffffff\"");
    expect(block).toContain("paint-order=\"stroke\"");
    expect(placedBlockSvg(fakeShaper, layout, box, { fill: "#ffffff", outline: null })).not.toContain("stroke");
    expect(pageOverlaySvg(800, 1200, [block])).toStartWith("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"1200\"");
  });
});

describe("lettering style", () => {
  it("picks the ink that contrasts with the paper, and dark ink when the paper is unknown", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(letteringStyle([250, 250, 250], false)).toEqual({ fill: "#111111", outline: null });
    expect(letteringStyle([30, 32, 40], false)).toEqual({ fill: "#ffffff", outline: null });
    expect(letteringStyle(null, false)).toEqual({ fill: "#111111", outline: null });
    // Mid grey 118 has luminance 0.181, 117 has 0.178: the two inks contrast equally at 0.179.
    expect(letteringStyle([118, 118, 118], false).fill).toBe("#111111");
    expect(letteringStyle([117, 117, 117], false).fill).toBe("#ffffff");
  });

  it("outlines in the other tone", () => {
    expect(letteringStyle([250, 250, 250], true)).toEqual({ fill: "#111111", outline: "#ffffff" });
    expect(letteringStyle([30, 32, 40], true)).toEqual({ fill: "#ffffff", outline: "#111111" });
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
        textFrom: "sentence",
        quarterTurns: 0,
        flags: [],
      }],
      clean: "membrane",
      paper: null,
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

  /** The placed box and the font size of the first block, read back from the SVG the page gets. */
  const placedBox = (svg: string) => {
    const [, cx, cy, halfWidth, halfHeight] = /translate\(([\d.]+) ([\d.]+)\) rotate\(0\) translate\(-([\d.]+) -([\d.]+)\)/u.exec(svg)!.map(Number);
    const fontSize = Number(/scale\(([\d.]+) /u.exec(svg)![1]) * fakeShaper.upem;
    return { x0: cx! - halfWidth!, y0: cy! - halfHeight!, x1: cx! + halfWidth!, y1: cy! + halfHeight!, fontSize };
  };
  const translation = { page: 1, units: text.units, targets: { "1": "你好" }, flags: {}, requests: 1 };

  it("keeps the lettering box inside the bubble and the page", () => {
    const region = vision.regions[0]!;
    const wide: PageVisionResult = {
      ...vision,
      regions: [{
        ...region,
        bubble: { x0: 0, y0: 440, x1: 400, y1: 600 },
        orientation: { ...region.orientation, frame: { cx: 200, cy: 520, w: 390, h: 150, angle: 0 } },
      }],
    };
    const box = placedBox(typesetPage(fakeShaper, wide, text, translation).svg);
    // Grown by 1.15 the frame would span x -24..424 and y 434..606: past the page and the bubble.
    expect(box.x0).toBeCloseTo(6.4, 1);
    expect(box.x1).toBeCloseTo(393.6, 1);
    expect(box.y0).toBeCloseTo(446.4, 1);
    expect(box.y1).toBeCloseTo(593.6, 1);
  });

  it("sets the text at most a tenth larger than the text it replaces", () => {
    const region = vision.regions[0]!;
    const withLines: PageVisionResult = { ...vision, regions: [{ ...region, lines: [line(200, 180, 150, 40, 0), line(200, 230, 150, 40, 0)] }] };
    // A 40 px line rectangle holds text of about 0.74 * 40 = 29.6 px; two characters would fit far larger than 1.1 * 29.6.
    expect(placedBox(typesetPage(fakeShaper, withLines, text, translation).svg).fontSize).toBe(32);
  });

  it("letters in light ink on dark paper, and outlines unless the bubble is plain paper", () => {
    const region = vision.regions[0]!;
    const svgOf = (changes: Partial<PageVisionResult["regions"][number]>) =>
      typesetPage(fakeShaper, { ...vision, regions: [{ ...region, ...changes }] }, text, translation).svg;
    expect(svgOf({})).toContain("fill=\"#111111\">");
    expect(svgOf({ paper: [28, 30, 36] })).toContain("fill=\"#ffffff\">");
    expect(svgOf({ paper: [28, 30, 36], clean: "inpaint" })).toContain("fill=\"#ffffff\" stroke=\"#111111\"");
    expect(svgOf({ paper: [240, 240, 240], bubble: null })).toContain("fill=\"#111111\" stroke=\"#ffffff\"");
  });

  it("never leaves a cleaned bubble empty when the translation failed", () => {
    const { svg } = typesetPage(fakeShaper, vision, text, { page: 1, units: text.units, targets: {}, flags: { "1": ["G1_REFUSAL"] }, requests: 4 });
    expect(svg.match(/<path /gu)).toHaveLength([...untranslatedPlaceholderZh].length);
  });
});
