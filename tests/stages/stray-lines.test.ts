import { describe, expect, it } from "bun:test";
import type { TextLine } from "../../src/stages/lines/interfaces/index.ts";
import { lineTone } from "../../src/stages/mask/line-tone.ts";
import { splitStrayLines } from "../../src/stages/regions/stray-lines.ts";
import { line } from "./fixtures.ts";

describe("splitStrayLines", () => {
  const dialogue = line(300, 100, 400, 40, 0);
  /** Every line is dark on paper of tone 200, except the ones in `light`. */
  const tones = (light: readonly TextLine[]) => (item: TextLine, paper: number | null) => ({ dark: !light.includes(item), paper: paper ?? 200 });

  it("takes a short line of the other tone out of the region's text", () => {
    const highlight = line(320, 60, 30, 28, 0);
    const mark = line(520, 100, 30, 30, 0);
    expect(splitStrayLines([dialogue, highlight, mark], tones([highlight]))).toEqual({ text: [dialogue, mark], stray: [highlight] });
  });

  it("keeps a long line of the other tone: a region can hold a dark and a light caption", () => {
    const caption = line(300, 160, 150, 40, 0);
    expect(splitStrayLines([dialogue, caption], tones([caption]))).toEqual({ text: [dialogue, caption], stray: [] });
  });

  it("judges the other lines against the paper of the longest line", () => {
    const asked: (number | null)[] = [];
    const short = line(320, 60, 30, 28, 0);
    splitStrayLines([short, dialogue], (item, paper) => {
      asked.push(paper);
      return { dark: true, paper: item === dialogue ? 181 : 0 };
    });
    expect(asked).toEqual([null, 181]);
  });

  it("keeps every line when the tone cannot be measured, and the only line of a region", () => {
    const short = line(320, 60, 30, 28, 0);
    expect(splitStrayLines([dialogue, short], () => null)).toEqual({ text: [dialogue, short], stray: [] });
    expect(splitStrayLines([short], tones([short]))).toEqual({ text: [short], stray: [] });
  });
});

describe("lineTone", () => {
  const width = 200;
  const height = 100;
  const grayOf = (paper: number, ink: number, x0: number, y0: number, x1: number, y1: number) => {
    const data = new Uint8Array(width * height).fill(paper);
    for (let y = y0; y < y1; y += 1) data.fill(ink, y * width + x0, y * width + x1);
    return { data, width, height };
  };

  it("tells dark text on light paper from light text on dark paper", () => {
    const bar = line(100, 50, 120, 30, 0);
    expect(lineTone(grayOf(240, 10, 60, 44, 140, 56), bar)).toEqual({ dark: true, paper: 240 });
    expect(lineTone(grayOf(30, 235, 60, 44, 140, 56), bar)).toEqual({ dark: false, paper: 30 });
  });

  it("judges a rectangle that a solid mark fills against the paper of the text it stands among", () => {
    // A black blob of 20 x 18 px in a rectangle of 20 x 20: most of what the rectangle and its band hold is ink.
    const gray = grayOf(250, 10, 90, 41, 110, 59);
    const blob = line(100, 50, 20, 20, 0);
    expect(lineTone(gray, blob)!.dark).toBe(false);
    expect(lineTone(gray, blob, 250)).toEqual({ dark: true, paper: 250 });
  });

  it("is null for a rectangle off the page", () => {
    expect(lineTone(grayOf(240, 10, 0, 0, 0, 0), line(-80, 50, 60, 30, 0))).toBeNull();
  });
});
