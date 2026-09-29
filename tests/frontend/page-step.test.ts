import { describe, expect, it } from "bun:test";
import { pageStep } from "../../src/frontend/reader/page-step.ts";

describe("pageStep", () => {
  it("turns manga pages with the left arrow and western pages with the right arrow", () => {
    expect(["ArrowLeft", "ArrowRight"].map((key) => pageStep(key, "rtl"))).toEqual([1, -1]);
    expect(["ArrowLeft", "ArrowRight"].map((key) => pageStep(key, "ltr"))).toEqual([-1, 1]);
    expect([" ", "PageUp", "Enter"].map((key) => pageStep(key, "rtl"))).toEqual([1, -1, 0]);
  });
});
