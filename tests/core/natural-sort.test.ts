import { describe, expect, it } from "bun:test";
import { compareNatural } from "../../src/core/natural-sort.ts";

const sorted = (names: string[]) => [...names].sort(compareNatural);

describe("compareNatural", () => {
  it("orders numbers by value, not by characters", () => {
    expect(sorted(["page10.png", "page2.png", "page1.png"])).toEqual(["page1.png", "page2.png", "page10.png"]);
  });

  it("orders zero-padded benchmark-style names", () => {
    expect(sorted(["010__010.webp", "002__002.webp", "155__002.webp", "001__001.webp"]))
      .toEqual(["001__001.webp", "002__002.webp", "010__010.webp", "155__002.webp"]);
  });

  it("reads full-width digits as digits", () => {
    expect(sorted(["第１０話.jpg", "第２話.jpg"])).toEqual(["第２話.jpg", "第１０話.jpg"]);
  });

  it("is case-insensitive but still total", () => {
    expect(sorted(["B.png", "a.png"])).toEqual(["a.png", "B.png"]);
    expect(compareNatural("a1.png", "a01.png")).not.toBe(0);
  });

  it("handles numbers beyond the safe integer range", () => {
    expect(sorted(["x99999999999999999999", "x100000000000000000000"]))
      .toEqual(["x99999999999999999999", "x100000000000000000000"]);
  });
});
