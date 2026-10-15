import { describe, expect, it } from "bun:test";
import { parseReview, reviewMessages, reviewSchema } from "../../src/review/review-contract.ts";

type ReviewCase = [answer: string, doubt: string | null];

describe("tr-review@1", () => {
  it("hands the reviewer one unit's source and translation as data", () => {
    const messages = reviewMessages("行くよ", "走吧");
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(JSON.parse(messages[1]!.content)).toEqual({ 原文: "行くよ", 译文: "走吧" });
    expect(reviewSchema.properties.verdict.enum).toEqual(["ok", "doubt"]);
  });

  it.each<ReviewCase>([
    ["{\"verdict\":\"ok\",\"reason\":\"\"}", null],
    ["{\"verdict\":\"doubt\",\"reason\":\"漏译了后半句\"}", "漏译了后半句"],
    ["{\"verdict\":\"doubt\",\"reason\":\" \"}", "译文可疑"],
    ["not json", null],
    ["[\"doubt\"]", null],
  ])("reads %p as %p", (answer, doubt) => {
    expect(parseReview(answer)).toBe(doubt);
  });
});
