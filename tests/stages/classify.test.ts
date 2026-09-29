import { describe, expect, it } from "bun:test";
import { classifyRegion } from "../../src/stages/regions/classify.ts";
import type { PageRegion } from "../../src/stages/regions/interfaces/index.ts";
import { estimateOrientation } from "../../src/stages/regions/orientation.ts";
import { line } from "./fixtures.ts";

const region = (overrides: Partial<PageRegion>): PageRegion => ({
  box: { x0: 100, y0: 100, x1: 200, y1: 200 },
  cls: "text_free",
  score: 0.9,
  bubble: null,
  lines: [],
  ...overrides,
});

const classify = (target: PageRegion, text: string, dialogueThickness: number | null = 20) =>
  classifyRegion(target, estimateOrientation(target.lines, target.box), text, 1000, 1400, dialogueThickness);

describe("classifyRegion", () => {
  it("treats bubble text as dialogue, or thought when wrapped in parentheses", () => {
    const inBubble = region({ bubble: { x0: 0, y0: 0, x1: 300, y1: 300 }, lines: [line(150, 150, 100, 20, 90)] });
    expect(classify(inBubble, "行くぞ")).toEqual({ layout: "bubble", kind: "dialogue", policy: "translate" });
    expect(classify(inBubble, "（どうしよう）").kind).toBe("thought");
  });

  it("recognises wide bottom narration bars", () => {
    const bar = region({ box: { x0: 50, y0: 1200, x1: 950, y1: 1300 } });
    expect(classify(bar, "その夜")).toMatchObject({ layout: "bottom_box", kind: "dialogue" });
  });

  it("keeps big, slanted, sound-like lettering as SFX", () => {
    const sfx = region({ lines: [line(150, 150, 200, 60, 30)] });
    expect(classify(sfx, "ドドドッ")).toEqual({ layout: "text_free", kind: "sfx", policy: "keep" });
  });

  it("does not call slanted dialogue-sized text SFX on tilt alone", () => {
    const sign = region({ lines: [line(150, 150, 200, 20, 30)] });
    expect(classify(sign, "営業中")).toEqual({ layout: "text_free", kind: "free_text", policy: "translate" });
  });
});
