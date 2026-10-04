import { describe, expect, it } from "bun:test";
import { unzipSync } from "fflate";
import { buildCbz, comicInfoXml } from "../../src/export/cbz.ts";
import type { PageVisionResult } from "../../src/pipeline/interfaces/index.ts";
import { typesetPage, untranslatedPlaceholderZh } from "../../src/pipeline/typeset-page.ts";
import { pageText } from "../../src/pipeline/volume-text.ts";
import { unifyEllipses } from "../../src/typeset/ellipsis.ts";
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

  it("balances the lines instead of leaving a character or two on the last one", () => {
    // Ten characters at 20 px in a box 170 px wide: eight fit on a line, which would leave two for the second.
    const layout = layoutText(fakeShaper, "一二三四五六七八九十", "h", 170, 60, 12, 20);
    expect(layout.fontSize).toBe(20);
    expect(layout.lines).toBe(2);
    const firstLineY = layout.glyphs[0]!.y;
    expect(layout.glyphs.filter((glyph) => glyph.y === firstLineY)).toHaveLength(5);
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
  it("letters in the ink of the text it replaces, with that text's outline", () => {
    // Black text on a dim dialogue box stays black, also on a night-scene box that is nearly black itself.
    expect(letteringStyle([24, 20, 22], [70, 72, 80], null)).toEqual({ fill: "#181416", outline: null });
    expect(letteringStyle([0, 0, 1], [22, 22, 22], null)).toEqual({ fill: "#000001", outline: null });
    expect(letteringStyle([250, 240, 200], [30, 32, 40], null)).toEqual({ fill: "#faf0c8", outline: null });
    expect(letteringStyle([20, 20, 20], [120, 90, 60], [255, 255, 255])).toEqual({ fill: "#141414", outline: "#ffffff" });
  });

  it("falls back to the ink that contrasts with the paper when no ink was measured or it cannot be read", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(letteringStyle(null, [250, 250, 250], null)).toEqual({ fill: "#111111", outline: null });
    expect(letteringStyle(null, [30, 32, 40], null)).toEqual({ fill: "#ffffff", outline: null });
    expect(letteringStyle(null, null, null)).toEqual({ fill: "#111111", outline: null });
    // Mid grey 118 has luminance 0.181, 117 has 0.178: the two inks contrast equally at 0.179.
    expect(letteringStyle(null, [118, 118, 118], null).fill).toBe("#111111");
    expect(letteringStyle(null, [117, 117, 117], null).fill).toBe("#ffffff");
    // An ink within 12 levels of the paper on every channel is a measuring error, not a choice.
    expect(letteringStyle([36, 40, 48], [30, 32, 40], null).fill).toBe("#ffffff");
  });
});

describe("unifyEllipses", () => {
  it("turns every row of dots into one ellipsis, whatever it is made of", () => {
    expect(unifyEllipses("嗯~……·下雨了······真的假的·", "")).toBe("嗯~…下雨了…真的假的…");
    expect(unifyEllipses("·小林……先生…………明天再说", "")).toBe("…小林…先生…明天再说");
    expect(unifyEllipses("好．．．．吧...嗯。。。", "")).toBe("好…吧…嗯…");
  });

  it("keeps a sentence period on its own, and drops the one that closes a row of dots", () => {
    expect(unifyEllipses("知道了。走吧……。", "")).toBe("知道了。走吧…");
    expect(unifyEllipses("3.5 倍", "")).toBe("3.5 倍");
  });

  it("keeps the interpunct of a name when the source has one", () => {
    expect(unifyEllipses("琳·哈特……你好", "リン・ハート…こんにちは")).toBe("琳·哈特…你好");
    // The same dot between two words of a sentence is what is left of a row of dots.
    expect(unifyEllipses("老师·还有问题吗", "先生・・・まだ質問が")).toBe("老师…还有问题吗");
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
        lineThickness: null,
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
      ink: null,
      outline: null,
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

  it("letters in the colours of the text it replaces", () => {
    const region = vision.regions[0]!;
    const svgOf = (changes: Partial<PageVisionResult["regions"][number]>) =>
      typesetPage(fakeShaper, { ...vision, regions: [{ ...region, ...changes }] }, text, translation).svg;
    expect(svgOf({})).toContain("fill=\"#111111\">");
    expect(svgOf({ ink: [24, 20, 22], paper: [70, 72, 80] })).toContain("fill=\"#181416\">");
    expect(svgOf({ ink: [250, 250, 250], paper: [28, 30, 36], outline: [0, 0, 0] })).toContain("fill=\"#fafafa\" stroke=\"#000000\"");
  });

  it("sets each utterance at the size of its own lines", () => {
    const region = vision.regions[0]!;
    const big: PageVisionResult = {
      ...vision,
      regions: [{ ...region, lines: [line(200, 150, 180, 30, 0), line(200, 250, 180, 80, 0)], utterances: [{ ...region.utterances[0]!, lineThickness: 80 }] }],
    };
    // The region's median line is 80 px thick here too, but only because of this utterance: 0.74 * 80 * 1.1 = 65.
    expect(placedBox(typesetPage(fakeShaper, big, text, translation).svg).fontSize).toBe(65);
    const small: PageVisionResult = { ...big, regions: [{ ...big.regions[0]!, utterances: [{ ...region.utterances[0]!, lineThickness: 30 }] }] };
    expect(placedBox(typesetPage(fakeShaper, small, text, translation).svg).fontSize).toBe(24);
  });

  it("letters one ellipsis for a row of dots", () => {
    const { svg } = typesetPage(fakeShaper, vision, text, { ...translation, targets: { "1": "好……·吧" } });
    expect(svg.match(/<path /gu)).toHaveLength(3);
  });

  it("never leaves a cleaned bubble empty when the translation failed", () => {
    const { svg } = typesetPage(fakeShaper, vision, text, { page: 1, units: text.units, targets: {}, flags: { "1": ["G1_REFUSAL"] }, requests: 4 });
    expect(svg.match(/<path /gu)).toHaveLength([...untranslatedPlaceholderZh].length);
  });
});
