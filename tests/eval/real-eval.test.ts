import { describe, expect, it } from "bun:test";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import { damageAgainstOriginal, damageLevel, orientTextlessPair, residualStrokeShare, textStrokeMask } from "../../eval/cli/real-score.ts";
import { parseRealEvalArgs } from "../../eval/cli/parse-real-eval-options.ts";
import { deriveTextAreas } from "../../eval/ground-truth/textless-diff.ts";

const blank = (width: number, height: number, value: number): RgbImage => {
  const data = new Uint8Array(width * height * 3);
  data.fill(value);
  return { data, width, height };
};

const paint = (image: RgbImage, x0: number, y0: number, x1: number, y1: number, value: number) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) image.data.fill(value, (y * image.width + x) * 3, (y * image.width + x) * 3 + 3);
  }
};

describe("textless pair orientation", () => {
  const textPage = blank(80, 80, 255);
  paint(textPage, 10, 10, 50, 50, 0);
  const barePage = blank(80, 80, 255);

  it("finds the text page by ink when the file order is swapped", () => {
    const forward = orientTextlessPair(textPage, barePage);
    const backward = orientTextlessPair(barePage, textPage);
    expect(forward.orderAgrees).toBe(true);
    expect(forward.text).toBe(textPage);
    expect(backward.orderAgrees).toBe(false);
    expect(backward.text).toBe(textPage);
    expect(backward.textless).toBe(barePage);
  });
});

describe("text stroke pixels", () => {
  it("keeps mask pixels where the text page is darker by at least diffLevel", () => {
    const text = blank(80, 80, 100);
    const textless = blank(80, 80, 100);
    paint(textless, 8, 8, 48, 48, 180);
    paint(text, 8, 8, 48, 48, 250);
    paint(text, 20, 20, 40, 40, 0);
    const { mask } = deriveTextAreas(text, textless);
    const strokes = textStrokeMask(text, textless, mask);
    const at = (x: number, y: number) => y * 80 + x;
    expect(mask[at(30, 30)]).toBe(1);
    expect(strokes[at(30, 30)]).toBe(1);
    expect(mask[at(12, 24)]).toBe(1);
    expect(strokes[at(12, 24)]).toBe(0);
  });
});

describe("damage against the original text page", () => {
  it("splits pixels outside the dilated mask into inside a region and outside every region", () => {
    const original = blank(30, 30, 100);
    const cleaned = blank(30, 30, 100);
    const mask = new Uint8Array(30 * 30);
    mask[2 * 30 + 2] = 1;
    paint(cleaned, 20, 20, 21, 21, 0);
    paint(cleaned, 28, 8, 29, 9, 0);
    paint(cleaned, 15, 15, 16, 16, 100 - 10);
    const damage = damageAgainstOriginal(original, cleaned, mask, [{ x0: 18, y0: 18, x1: 24, y1: 24 }]);
    expect(damage).toEqual({ damageCount: 2, damageShare: 2 / 900, damageInsideRegion: 1, damageOutsideRegion: 1 });
    expect(10).toBeLessThan(damageLevel);
  });

  it("counts a stroke as residual only while the cleaned pixel stays near the original", () => {
    const original = blank(4, 4, 0);
    const cleaned = blank(4, 4, 0);
    paint(cleaned, 1, 0, 2, 1, 255);
    const strokes = new Uint8Array(16);
    strokes[0] = 1;
    strokes[1] = 1;
    expect(residualStrokeShare(original, cleaned, strokes)).toEqual({ strokePixels: 2, residualStrokeShare: 0.5 });
  });
});

describe("real eval options", () => {
  it("keeps a positional when no option is present", () => {
    const parsed = parseRealEvalArgs(["volume.cbz"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toEqual({ out: null, pages: null, gpu: false, positionals: ["volume.cbz"] });
  });

  it("does not treat the value of a present option as a positional", () => {
    const parsed = parseRealEvalArgs(["--pages", "2", "a.cbz", "--out", "D:\\real-out", "b.zip", "--gpu"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toEqual({ out: "D:\\real-out", pages: 2, gpu: true, positionals: ["a.cbz", "b.zip"] });
  });

  it("rejects a missing value, zero pages and an unknown flag", () => {
    expect(parseRealEvalArgs(["--pages"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--out"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--pages", "0"]).ok).toBe(false);
    expect(parseRealEvalArgs(["--gpu", "--seed"]).ok).toBe(false);
  });
});
