import { describe, expect, it } from "bun:test";
import { translationFlags } from "../../src/qa/translation-flags.ts";

describe("translationFlags", () => {
  it("raises an error for units without a translation and a warning for missed terms", () => {
    const flags = translationFlags({
      page: 3,
      units: ["1", "2", "3"].map((id) => ({ id, kind: "dialogue" as const, source: "…" })),
      targets: { "1": "好", "3": "小林" },
      flags: { "2": ["G1_REFUSAL"], "3": ["TR_TERM_MISS"] },
      requests: 4,
    });
    expect(flags).toEqual([
      { code: "TR_FAILED", severity: "error", class: "decisive", evidence: { unit: "2", checks: ["G1_REFUSAL"] } },
      { code: "TR_TERM_MISS", severity: "warn", class: "advisory", evidence: { unit: "3" } },
    ]);
  });
});
