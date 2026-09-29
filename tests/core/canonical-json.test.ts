import { describe, expect, it } from "bun:test";
import { cacheKey, seedFromKey } from "../../src/core/cache-key.ts";
import { canonicalJson } from "../../src/core/canonical-json.ts";

describe("canonicalJson", () => {
  it("sorts keys by UTF-16 code units as RFC 8785 requires", () => {
    const input = { "\u20ac": 1, "\r": 2, "\ufb33": 3, "1": 4, "\ud83d\ude00": 5, "\u0080": 6, "\u00f6": 7 };
    const keys = Object.keys(JSON.parse(canonicalJson(input)));
    // JSON.parse re-orders integer-like keys first, so compare the raw text instead
    expect(keys.length).toBe(7);
    expect(canonicalJson(input)).toBe(
      "{\"\\r\":2,\"1\":4,\"\u0080\":6,\"\u00f6\":7,\"\u20ac\":1,\"\ud83d\ude00\":5,\"\ufb33\":3}",
    );
  });

  it("serialises nested values without whitespace and drops undefined members", () => {
    expect(canonicalJson({ b: [true, null, "x", 1.5], a: { d: undefined, c: -0.25 } }))
      .toBe("{\"a\":{\"c\":-0.25},\"b\":[true,null,\"x\",1.5]}");
  });

  it("uses ECMAScript number formatting", () => {
    expect(canonicalJson([1e21, 1e-7, 0.1, 100])).toBe("[1e+21,1e-7,0.1,100]");
  });

  it("rejects values JSON cannot represent", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson({ big: 1n })).toThrow();
  });
});

describe("cacheKey", () => {
  it("does not depend on property order", () => {
    expect(cacheKey({ stage: "detect", params: { a: 1, b: 2 } })).toBe(cacheKey({ params: { b: 2, a: 1 }, stage: "detect" }));
  });

  it("derives a stable non-negative 31-bit seed", () => {
    const key = cacheKey({ stage: "translate" });
    expect(seedFromKey(key)).toBe(seedFromKey(key));
    expect(seedFromKey("ffffffff00")).toBe(0x7fffffff);
  });
});
