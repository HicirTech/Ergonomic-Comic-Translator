import { describe, expect, it } from "bun:test";
import { readingOrder } from "../../src/stages/order/reading-order.ts";

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe("readingOrder", () => {
  // Two panel rows; in each row a right and a left bubble.
  const page = [
    box(50, 50, 150, 200), // top-left
    box(300, 40, 420, 180), // top-right
    box(40, 400, 160, 520), // bottom-left
    box(280, 420, 400, 560), // bottom-right
  ];

  it("reads manga rows top to bottom and each row right to left", () => {
    expect(readingOrder(page, "rtl")).toEqual([1, 0, 3, 2]);
  });

  it("reads left to right for western layouts", () => {
    expect(readingOrder(page, "ltr")).toEqual([0, 1, 2, 3]);
  });

  it("splits a column of stacked bubbles inside a wide band", () => {
    const tall = [box(300, 0, 400, 300), box(50, 0, 150, 120), box(50, 150, 150, 280)];
    expect(readingOrder(tall, "rtl")).toEqual([0, 1, 2]);
  });

  it("falls back to top then reading direction for overlapping boxes", () => {
    const overlapping = [box(0, 10, 200, 100), box(100, 0, 300, 90)];
    expect(readingOrder(overlapping, "rtl")).toEqual([1, 0]);
    expect(readingOrder([], "rtl")).toEqual([]);
  });
});
