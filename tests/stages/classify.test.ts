import { describe, expect, it } from "bun:test";
import { classifyRegion } from "../../src/stages/regions/classify.ts";
import type { LetteringCues, PageRegion } from "../../src/stages/regions/interfaces/index.ts";
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

/** Typeset text in plain ink that reads well, among other text of its bubble. */
const plain: LetteringCues = { coloured: false, typesetInk: false, outlined: false, hollow: false, otherInkThanBubble: false, aloneInBubble: false, readUnsure: false };

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

  it("keeps art lettering drawn across a bubble: not in the ink of the bubble's dialogue, and drawn", () => {
    const inBubble = region({ cls: "text_bubble", bubble: { x0: 0, y0: 0, x1: 300, y1: 300 }, lines: [line(150, 150, 100, 20, 0)] });
    const withCues = (lettering: Partial<LetteringCues>, text = "ゆらり") =>
      classifyRegion(inBubble, estimateOrientation(inBubble.lines, inBubble.box), text, 1000, 1400, 20, { ...plain, ...lettering });
    expect(withCues({ outlined: true, otherInkThanBubble: true })).toEqual({ layout: "bubble", kind: "sfx", policy: "keep" });
    expect(withCues({ otherInkThanBubble: true }, "ドドドッ").policy).toBe("keep");
    // In the dialogue's own ink it is dialogue, however it is drawn; in another ink but typeset it may be a name tag.
    expect(withCues({ coloured: true, outlined: true }).policy).toBe("translate");
    expect(withCues({ otherInkThanBubble: true }).policy).toBe("translate");
  });

  it("keeps lettering that stands alone in a bubble when it is drawn in colour or outline and does not read as text", () => {
    const inBubble = region({ cls: "text_bubble", bubble: { x0: 0, y0: 0, x1: 300, y1: 300 }, lines: [line(150, 150, 280, 250, 0)] });
    const withCues = (lettering: Partial<LetteringCues>, text = "ゆらり") =>
      classifyRegion(inBubble, estimateOrientation(inBubble.lines, inBubble.box), text, 1000, 1400, 250, { ...plain, aloneInBubble: true, ...lettering });
    expect(withCues({ coloured: true, readUnsure: true })).toEqual({ layout: "bubble", kind: "sfx", policy: "keep" });
    expect(withCues({ outlined: true, readUnsure: true }).policy).toBe("keep");
    expect(withCues({ coloured: true, outlined: true }).policy).toBe("keep");
    // A sound drawn in colour on its own is lettering, however well it reads; in black or white it may be dialogue.
    expect(withCues({ coloured: true }, "ああ、").policy).toBe("keep");
    expect(withCues({ outlined: true }, "ああ、").policy).toBe("translate");
    // Dialogue set large in a box of its own is black or white without an outline, however badly it reads;
    // dialogue in colour reads well.
    expect(withCues({ readUnsure: true }).policy).toBe("translate");
    expect(withCues({ coloured: true }).policy).toBe("translate");
    expect(withCues({ coloured: true, readUnsure: true, aloneInBubble: false }).policy).toBe("translate");
    // A colour the page's typeset text is set in is no cue: a book may set its dialogue in dark blue or pink.
    expect(withCues({ coloured: true, typesetInk: true, outlined: true }).policy).toBe("translate");
    expect(withCues({ coloured: true, typesetInk: true }, "ああ、").policy).toBe("translate");
    expect(withCues({ coloured: true, typesetInk: true, readUnsure: true }).policy).toBe("keep");
  });

  it("counts coloured ink and an outline as cues for lettering outside bubbles", () => {
    const upright = region({ lines: [line(150, 150, 200, 20, 0)] });
    const withCues = (lettering: Partial<LetteringCues>) =>
      classifyRegion(upright, estimateOrientation(upright.lines, upright.box), "おわり", 1000, 1400, 20, { ...plain, ...lettering });
    expect(withCues({ coloured: true, outlined: true })).toEqual({ layout: "text_free", kind: "sfx", policy: "keep" });
    // Black text with a white outline is how captions are set on artwork.
    expect(withCues({ outlined: true }).policy).toBe("translate");
    // A caption set in a colour the page's typeset text is set in, with an outline, is typeset like that text.
    expect(withCues({ coloured: true, typesetInk: true, outlined: true }).policy).toBe("translate");
    expect(withCues({ coloured: true, typesetInk: true, outlined: true, readUnsure: true }).policy).toBe("keep");
  });

  it("keeps glyphs drawn as outlines around a fill, as a title on the artwork or in a bottom box is", () => {
    const withCues = (target: PageRegion, lettering: Partial<LetteringCues>) =>
      classifyRegion(target, estimateOrientation(target.lines, target.box), "森の悪魔", 1000, 1400, null, { ...plain, ...lettering });
    const title = region({ box: { x0: 50, y0: 1200, x1: 950, y1: 1300 }, lines: [line(500, 1250, 800, 60, 0)] });
    expect(withCues(title, { hollow: true, outlined: true })).toEqual({ layout: "bottom_box", kind: "sfx", policy: "keep" });
    // Narration in a bottom bar is set solid, with or without an outline.
    expect(withCues(title, { outlined: true })).toEqual({ layout: "bottom_box", kind: "dialogue", policy: "translate" });
    const caption = region({ lines: [line(150, 150, 200, 20, 0)] });
    expect(withCues(caption, { hollow: true, outlined: true }).policy).toBe("keep");
  });

  it("keeps a region whose text holds no letter or digit: a drawn mark leaves nothing to translate", () => {
    const inBubble = region({ cls: "text_bubble", bubble: { x0: 0, y0: 0, x1: 300, y1: 300 }, lines: [line(150, 150, 100, 20, 90)] });
    expect(classify(inBubble, "～～～")).toEqual({ layout: "bubble", kind: "sfx", policy: "keep" });
    expect(classify(inBubble, "え？").policy).toBe("translate");
    const caption = region({ lines: [line(150, 150, 200, 20, 0)] });
    expect(classify(caption, "．．．")).toEqual({ layout: "text_free", kind: "sfx", policy: "keep" });
  });
});
