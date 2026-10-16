import { describe, expect, it } from "bun:test";
import type { InkEvidence } from "../../src/stages/regions/page-ink.ts";
import { pageTypesetInks } from "../../src/stages/regions/page-ink.ts";

const evidence = (overrides: Partial<InkEvidence> = {}): InkEvidence => ({
  ink: [20, 15, 71],
  letters: 20,
  meanProb: 0.97,
  ...overrides,
});

describe("pageTypesetInks", () => {
  it("lists the inks of the typeset regions once each", () => {
    const regions = [evidence(), evidence({ ink: [24, 19, 66] }), evidence({ ink: [224, 78, 129] })];
    expect(pageTypesetInks(regions)).toEqual([[20, 15, 71], [224, 78, 129]]);
  });

  it("counts only regions that are typeset text by their own evidence", () => {
    expect(pageTypesetInks([evidence({ letters: 7 })])).toEqual([]);
    expect(pageTypesetInks([evidence({ meanProb: 0.79 })])).toEqual([]);
    expect(pageTypesetInks([evidence({ ink: null })])).toEqual([]);
    expect(pageTypesetInks([evidence({ letters: 8, meanProb: 0.8 })])).toEqual([[20, 15, 71]]);
  });
});
