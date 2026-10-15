import { describe, expect, it } from "bun:test";
import type { GrayImage } from "../../src/imaging/interfaces/index.ts";
import type { OcrCandidate } from "../../src/stages/ocr/interfaces/index.ts";
import { cutOffsets, edgeProfile, joinPieceCandidates, lineChars, maxPieceChars, pieceBoxes, pieceCount, piecesFromChars } from "../../src/stages/ocr/line-pieces.ts";
import { line } from "./fixtures.ts";

type CountCase = [chars: number, pieces: number];

/** A white strip with dark glyph blocks of `glyph` px every `pitch` px along x, two px of paper above and below. */
const glyphStrip = (width: number, height: number, pitch: number, glyph: number): GrayImage => {
  const data = new Uint8Array(width * height).fill(255);
  for (let x = 0; x < width; x += 1) {
    if (x % pitch >= glyph) continue;
    for (let y = 2; y < height - 2; y += 1) data[y * width + x] = 0;
  }
  return { data, width, height };
};

const transposed = (strip: GrayImage): GrayImage => {
  const data = new Uint8Array(strip.width * strip.height);
  for (let y = 0; y < strip.height; y += 1) {
    for (let x = 0; x < strip.width; x += 1) data[x * strip.height + y] = strip.data[y * strip.width + x]!;
  }
  return { data, width: strip.height, height: strip.width };
};

const candidate = (quarterTurns: number, text: string, meanProb: number, minProb: number, tokens: number): OcrCandidate =>
  ({ quarterTurns, text, meanProb, minProb, tokens });
const structure = (text: string): OcrCandidate => candidate(0, text, 0.9, 0.9, [...text].length);

describe("pieceCount", () => {
  it.each<CountCase>([
    [piecesFromChars - 1, 1],
    [piecesFromChars, 2],
    [3 * maxPieceChars, 3],
    [3 * maxPieceChars + 1, 4],
  ])("reads a line of %p characters in %p piece(s)", (chars, pieces) => {
    expect(pieceCount(chars)).toBe(pieces);
  });
});

describe("lineChars", () => {
  it("counts the structure reading, and at least one character per thickness of length", () => {
    const column = line(100, 100, 200, 20, 90);
    expect(lineChars(column, structure(" あいうえおかきくけこさしすせそ "))).toBe(15);
    expect(lineChars(column, structure("あい"))).toBe(10);
    expect(lineChars(column, undefined)).toBe(10);
  });
});

describe("edgeProfile", () => {
  it("is quiet between glyphs and busy on them, along x for a horizontal strip and along y for a column", () => {
    const strip = glyphStrip(400, 24, 20, 16);
    const horizontal = edgeProfile(strip, "h");
    const vertical = edgeProfile(transposed(strip), "v");
    expect(horizontal[18]).toBe(0);
    expect(horizontal[8]).toBeGreaterThan(0);
    expect(vertical[18]).toBe(0);
    expect(vertical[8]).toBeGreaterThan(0);
  });
});

describe("cutOffsets", () => {
  it("cuts a line in the gaps nearest the even shares", () => {
    // Glyphs of 16 px on a pitch of 20: the gaps run from 16 to 18, 36 to 38, and so on; the thirds of
    // 400 fall at 133 and 267, the nearest gaps have their middles at 138 and 258.
    expect(cutOffsets(edgeProfile(glyphStrip(400, 24, 20, 16), "h"), 3, 20)).toEqual([138, 258]);
  });

  it("cuts a line without gaps at the quietest place within half a pitch of the share", () => {
    const profile = new Float64Array(100).fill(10);
    profile[47] = 2;
    profile[70] = 1;
    expect(cutOffsets(profile, 2, 10)).toEqual([47]);
  });

  it("does not cut a line read in one piece", () => {
    expect(cutOffsets(new Float64Array(100), 1, 10)).toEqual([]);
  });
});

describe("pieceBoxes", () => {
  it("cuts a horizontal line box at the offsets and grows the pieces across the line only", () => {
    expect(pieceBoxes({ x0: 10, y0: 100, x1: 110, y1: 120 }, "h", [40, 70])).toEqual([
      { x0: 10, y0: 97, x1: 50, y1: 123 },
      { x0: 50, y0: 97, x1: 80, y1: 123 },
      { x0: 80, y0: 97, x1: 110, y1: 123 },
    ]);
  });

  it("cuts a column top to bottom", () => {
    expect(pieceBoxes({ x0: 100, y0: 10, x1: 120, y1: 110 }, "v", [60])).toEqual([
      { x0: 97, y0: 10, x1: 123, y1: 70 },
      { x0: 97, y0: 70, x1: 123, y1: 110 },
    ]);
  });
});

describe("joinPieceCandidates", () => {
  it("joins the pieces read at the same turn, with the mean over all tokens and the lowest probability of a piece that read something", () => {
    const joined = joinPieceCandidates([
      [candidate(0, "今日は ", 0.9, 0.5, 4), candidate(1, "x", 0.3, 0.1, 1)],
      [candidate(0, "", 0, 0, 0), candidate(1, "y", 0.4, 0.2, 1)],
      [candidate(0, " いい天気", 0.8, 0.6, 6)],
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ quarterTurns: 0, text: "今日はいい天気", minProb: 0.5, tokens: 10 });
    expect(joined[0]!.meanProb).toBeCloseTo(0.84, 10);
  });

  it("hands a single crop's candidates on unchanged", () => {
    const candidates = [candidate(0, " a ", 0.9, 0.8, 1), candidate(3, "b", 0.2, 0.1, 1)];
    expect(joinPieceCandidates([candidates])).toEqual(candidates);
  });

  it("has nothing without pieces", () => {
    expect(joinPieceCandidates([])).toEqual([]);
  });
});
