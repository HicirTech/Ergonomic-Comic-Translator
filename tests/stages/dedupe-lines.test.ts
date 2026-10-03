import { describe, expect, it } from "bun:test";
import { dedupeLines } from "../../src/stages/regions/dedupe-lines.ts";
import { line } from "./fixtures.ts";

describe("dedupeLines", () => {
  it("keeps the more confident of two detections of the same rectangle", () => {
    const sure = line(200, 100, 300, 40, 0, 0.95);
    expect(dedupeLines([line(202, 101, 296, 42, 0, 0.8), sure])).toEqual([sure]);
  });

  it("keeps the thin detection of a line found with two thicknesses, as long as the thick one", () => {
    // A vertical column: the crop pass drew it 88 px thick and a little longer, the page pass 39 px thick.
    const thick = line(1019, 969, 312, 88, 90, 0.99);
    const thin = line(1020, 973, 272, 39, 90, 0.98);
    const [kept, ...rest] = dedupeLines([thick, thin]);
    expect(rest).toEqual([]);
    expect(kept!.rect.short).toBe(39);
    expect(kept!.rect.angle).toBe(90);
    expect(kept!.rect.center.x).toBeCloseTo(1020, 6);
    // The thick one spans y 813..1125, the thin one 837..1109.
    expect(kept!.rect.center.y - kept!.rect.long / 2).toBeCloseTo(813, 6);
    expect(kept!.rect.center.y + kept!.rect.long / 2).toBeCloseTo(1125, 6);
    expect(Math.min(...kept!.quad.map((point) => point.y))).toBeCloseTo(813, 6);
    expect(Math.max(...kept!.quad.map((point) => point.x)) - Math.min(...kept!.quad.map((point) => point.x))).toBeCloseTo(39, 6);
  });

  it("drops the pieces of a longer line", () => {
    const whole = line(420, 484, 432, 49, 0, 0.98);
    const pieces = [line(571, 484, 122, 48, 1, 0.97), line(474, 483, 95, 45, 0, 0.96)];
    expect(dedupeLines([...pieces, whole])).toEqual([whole]);
  });

  it("keeps neighbouring lines, a short last line, and lines that cross", () => {
    const paragraph = [line(300, 100, 400, 40, 0, 0.9), line(300, 150, 400, 40, 0, 0.9), line(180, 200, 160, 40, 0, 0.9)];
    const crossing = line(300, 150, 300, 40, 60, 0.9);
    const kept = dedupeLines([...paragraph, crossing]);
    expect(kept).toHaveLength(4);
    expect(kept).toEqual(expect.arrayContaining([...paragraph, crossing]));
  });

  it("keeps a short line inside a rectangle twice as thick: that is two lines seen as one, not a piece", () => {
    const blob = line(300, 125, 400, 90, 0, 0.9);
    const short = line(180, 148, 160, 40, 0, 0.95);
    expect(dedupeLines([blob, short])).toHaveLength(2);
  });
});
