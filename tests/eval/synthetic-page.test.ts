import { describe, expect, it } from "bun:test";
import { canonicalJson } from "../../src/core/canonical-json.ts";
import { sha256Hex } from "../../src/core/hash.ts";
import { lineCrop } from "../../src/pipeline/plan-utterances.ts";
import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { maxFontSizePx, maxSlantDeg, minFontSizePx, minSlantDeg, pageHeightPx, pageWidthPx } from "../../eval/synthetic/constants.ts";
import { blockCropOf, linePolygon, rotatedRectFromPolygon, textLineFromPolygon } from "../../eval/synthetic/line-geometry.ts";
import { assertGlyphsPresent, missingGlyphs } from "../../eval/synthetic/missing-glyph.ts";
import { paintSyntheticPage } from "../../eval/synthetic/paint-page.ts";
import { planSyntheticPages } from "../../eval/synthetic/plan-pages.ts";
import { singleSentences } from "../../eval/synthetic/sentences.ts";

/** CJK is 1 em, ASCII half an em. The path fills the em box so a render has ink. */
const fakeShaper: Shaper = {
  upem: 1000,
  shape: (text, direction) => {
    const glyphs = [];
    let offset = 0;
    for (const char of text) {
      const code = char.codePointAt(0)!;
      const wide = code > 0x2000;
      glyphs.push({
        id: code === 0x6b20 ? 0 : code,
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
  glyphPath: () => "M0 0H1000V800H0Z",
};

const center = (polygon: readonly { x: number; y: number }[]) => ({
  x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
  y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
});

const readingDot = (angle: number, crop: ReturnType<typeof lineCrop>) => {
  const edgeX = crop.corners[1].x - crop.corners[0].x;
  const edgeY = crop.corners[1].y - crop.corners[0].y;
  const radians = (angle * Math.PI) / 180;
  return edgeX * -Math.sin(radians) + edgeY * Math.cos(radians);
};

describe("synthetic pages", () => {
  it("repeats a seed and changes with a different seed", () => {
    const first = canonicalJson(planSyntheticPages(fakeShaper, 1, 9));
    const second = canonicalJson(planSyntheticPages(fakeShaper, 1, 9));
    expect(first).toBe(second);
    expect(canonicalJson(planSyntheticPages(fakeShaper, 99, 9))).not.toBe(first);
  });

  it("keeps every block on the page at the font and slant limits", () => {
    for (const seed of [1, 2, 8, 99]) {
      const pages = planSyntheticPages(fakeShaper, seed, 9);
      expect(pages).toHaveLength(9);
      for (const page of pages) {
        expect(page.width).toBe(pageWidthPx);
        expect(page.height).toBe(pageHeightPx);
        for (const block of page.blocks) {
          expect(block.fontSize).toBeGreaterThanOrEqual(minFontSizePx);
          expect(block.fontSize).toBeLessThanOrEqual(maxFontSizePx);
          const slanted = block.kind === "slant-h" || block.kind === "slant-v";
          expect(Math.abs(block.angle) === 0 || slanted).toBe(true);
          if (slanted) {
            expect(Math.abs(block.angle)).toBeGreaterThanOrEqual(minSlantDeg);
            expect(Math.abs(block.angle)).toBeLessThanOrEqual(maxSlantDeg);
          }
        }
      }
    }
  });

  it("orders vertical columns from right to left and horizontal lines from top to bottom", () => {
    const pages = planSyntheticPages(fakeShaper, 1, 9);
    const vertical = pages[3]!.blocks[0]!;
    const horizontal = pages[2]!.blocks[0]!;
    expect(vertical.kind).toBe("v-block");
    expect(vertical.angle).toBe(0);
    expect(vertical.direction).toBe("v");
    expect(blockCropOf(vertical).quarterTurns).toEqual([0, 1, 2, 3]);
    expect(blockCropOf(horizontal).quarterTurns).toEqual([0, 1, 2, 3]);
    const columns = vertical.lines.map((line) => center(line.polygon));
    for (let index = 1; index < columns.length; index += 1) expect(columns[index - 1]!.x).toBeGreaterThan(columns[index]!.x);
    expect(horizontal.kind).toBe("h-block");
    const rows = horizontal.lines.map((line) => center(line.polygon));
    for (let index = 1; index < rows.length; index += 1) expect(rows[index - 1]!.y).toBeLessThan(rows[index]!.y);
    expect(pages[0]!.blocks[0]!.sentenceKey).toBe(pages[1]!.blocks[0]!.sentenceKey);
    expect(pages[0]!.blocks[0]!.direction).toBe("h");
    expect(pages[1]!.blocks[0]!.direction).toBe("v");
    const mixed = pages[8]!;
    const top = mixed.blocks.reduce((best, block) => (block.readingOrder < best.readingOrder ? block : best));
    const bottom = mixed.blocks.reduce((best, block) => (block.readingOrder > best.readingOrder ? block : best));
    expect(top.cy).toBeLessThan(bottom.cy);
  });

  it("turns a vertical line crop so its long side follows the column", () => {
    for (const angle of [0, 20, -20]) {
      const polygon = linePolygon("v", { x: 400, y: 700 }, 36, 220, angle);
      const crop = lineCrop(textLineFromPolygon(polygon));
      expect(crop.width).toBeGreaterThan(crop.height);
      expect(readingDot(angle, crop)).toBeGreaterThan(0);
      const restored = rotatedRectFromPolygon(polygon);
      expect(restored.long).toBeGreaterThan(restored.short);
    }
    const generated = planSyntheticPages(fakeShaper, 1, 4)[3]!.blocks[0]!.lines[0]!;
    const crop = lineCrop(textLineFromPolygon(generated.polygon));
    expect(crop.width).toBeGreaterThanOrEqual(crop.height);
    expect(crop.corners[1].y).toBeGreaterThan(crop.corners[0].y);
  });

  it("paints the same pixels for one seed and puts ink only in the mask", async () => {
    const page = planSyntheticPages(fakeShaper, 1, 1)[0]!;
    const first = await paintSyntheticPage(fakeShaper, page);
    const second = await paintSyntheticPage(fakeShaper, page);
    expect(sha256Hex(first.pagePng)).toBe(sha256Hex(second.pagePng));
    expect(sha256Hex(first.backgroundPng)).toBe(sha256Hex(second.backgroundPng));
    expect(sha256Hex(first.maskPng)).toBe(sha256Hex(second.maskPng));
    expect(sha256Hex(first.pagePng)).not.toBe(sha256Hex(first.backgroundPng));
    expect(first.mask.some((value) => value === 255)).toBe(true);
    const outlined = planSyntheticPages(fakeShaper, 1, 5)[4]!;
    expect(outlined.background).toBe("dark");
    const plain = await paintSyntheticPage(fakeShaper, { ...page, blocks: page.blocks.map((block) => ({ ...block, kind: "h-line" })) });
    const art = await paintSyntheticPage(fakeShaper, { ...page, blocks: page.blocks.map((block) => ({ ...block, kind: "art-h" })) });
    const ink = (mask: Uint8Array) => mask.reduce((sum, value) => sum + value, 0);
    expect(ink(art.mask)).toBeGreaterThan(ink(plain.mask));
  });

  it("names the characters the font cannot draw", () => {
    expect(missingGlyphs(fakeShaper, "欠字", "h")).toEqual(["欠"]);
    expect(() => assertGlyphsPresent(fakeShaper, ["欠字"])).toThrow(/欠/);
    expect(missingGlyphs(fakeShaper, singleSentences[0]!, "v")).toEqual([]);
  });
});
