import { describe, expect, it } from "bun:test";
import { missingTerms, replaceUntranslatedName } from "../../src/qa/term-compliance.ts";
import { findCandidates } from "../../src/terms/candidates.ts";
import { chunkLines, validateExtraction } from "../../src/terms/extract-contract.ts";
import { applyFixAnswer, fixBatches, fixSchema, kwic, votedGender } from "../../src/terms/fix-contract.ts";
import { freezeGlossary, resolveTerms } from "../../src/terms/freeze.ts";
import type { FixedTerm, MergedTerm, SourceLine } from "../../src/terms/interfaces/index.ts";
import { createMatcher } from "../../src/terms/matcher.ts";
import { mergeEntities } from "../../src/terms/merge.ts";
import { normKey, splitHonorific, toKatakana } from "../../src/terms/norm-key.ts";

const line = (id: string, text: string, nameTag = false): SourceLine => ({ id, page: Number(id.split(".")[0]), text, nameTag });

const merged = (overrides: Partial<MergedTerm>): MergedTerm => ({
  normKey: "リン",
  canonical: "リン",
  kind: "person",
  surfaces: ["リン"],
  votes: 1,
  occurrences: 3,
  firstPage: 1,
  genderVotes: { m: 0, f: 0, x: 0 },
  partOf: [],
  ...overrides,
});

const fixed = (overrides: Partial<FixedTerm>): FixedTerm => ({
  ...merged({}),
  target: "琳",
  targetAliases: [],
  gender: "unknown",
  noteZh: "",
  origin: "auto",
  locked: false,
  ...overrides,
});

describe("norm keys", () => {
  it("unifies kana, collapses stretched marks but keeps a single one, drops dots and honorifics", () => {
    expect(toKatakana("りん")).toBe("リン");
    expect(normKey("りんちゃん")).toBe("リン");
    expect(normKey("ユーーリ")).toBe("ユーリ");
    expect(normKey("ユーリ")).not.toBe(normKey("ユリ"));
    expect(normKey("リン・ハート")).toBe("リンハート");
    expect(splitHonorific("先輩")).toEqual({ base: "先輩", honorific: null });
  });
});

describe("S7a candidates", () => {
  it("collects katakana names seen twice, honorific names and name tags; rejects stretched words", () => {
    const candidates = findCandidates([
      line("1.1.0", "リンが来た"),
      line("2.1.0", "リン、待って"),
      line("2.2.0", "アキラくん！"),
      line("3.1.0", "ドキドキ～"),
      line("3.2.0", "【ユキ】", true),
      line("4.1.0", "カメラ"),
    ], "ja");
    const keys = candidates.map((candidate) => candidate.normKey).sort();
    expect(keys).toEqual(["アキラ", "ユキ", "リン"]);
    expect(candidates.find((candidate) => candidate.normKey === "リン")).toMatchObject({ count: 2, pages: [1, 2], signals: ["kata"] });
  });
});

describe("S7b extraction", () => {
  const lines = [line("1.1.0", "リンちゃん、おはよう"), line("1.2.0", "ユキです")];

  it("chunks whole pages within the budget", () => {
    const many = Array.from({ length: 60 }, (_, index) => line(`${index + 1}.1.0`, "あ".repeat(50)));
    const chunks = chunkLines(many);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(60);
  });

  it("keeps only entities proven by their evidence lines", () => {
    const content = JSON.stringify({
      entities: [
        { src: "リンちゃん", kind: "person", base: "リン", honorific: "ちゃん", evidence: ["1.1.0"], gender: "f" },
        { src: "ユキ", kind: "person", evidence: ["1.1.0"] },
        { src: "マコト", kind: "person", evidence: ["9.9.9"] },
        { src: "ユキ", kind: "weapon", evidence: ["1.2.0"] },
        { src: "ユキ", kind: "person", base: "ユ", evidence: ["1.2.0"] },
      ],
    });
    expect(validateExtraction(content, lines)).toEqual([
      { src: "リンちゃん", kind: "person", base: "リン", honorific: "ちゃん", gender: "f", evidence: ["1.1.0"] },
      { src: "ユキ", kind: "person", base: "ユ", evidence: ["1.2.0"] },
    ]);
  });
});

describe("S7c merge", () => {
  const lines = [line("1.1.0", "リンちゃん！"), line("2.1.0", "リンちゃん、来て"), line("3.1.0", "学園に行く"), line("4.1.0", "リン・ハートです")];

  it("merges honorific and kana variants, keeps one-off people, drops one-off terms, adds address terms", () => {
    const terms = mergeEntities([
      [{ src: "リンちゃん", kind: "person", base: "リン", honorific: "ちゃん", evidence: ["1.1.0"], gender: "f" }],
      [{ src: "りんちゃん", kind: "person", evidence: ["2.1.0"], gender: "f" }, { src: "学園", kind: "place", evidence: ["3.1.0"] }],
      [{ src: "リン・ハート", kind: "person", evidence: ["4.1.0"] }],
    ], lines);
    const rin = terms.find((term) => term.normKey === "リン")!;
    expect(rin).toMatchObject({ kind: "person", votes: 2, firstPage: 1, genderVotes: { m: 0, f: 2, x: 0 }, partOf: ["リンハート"] });
    expect(terms.some((term) => term.normKey === "学園")).toBe(false);
    expect(terms.find((term) => term.kind === "address")).toMatchObject({ canonical: "リンちゃん", honorific: "ちゃん", votes: 2 });
  });
});

describe("S7d fixing", () => {
  const lines = Array.from({ length: 9 }, (_, index) => line(`${index + 1}.1.0`, `${index}号：リンはここにいる`));

  it("orders batches people first and quotes first, middle and last occurrences", () => {
    const batches = fixBatches([merged({ kind: "place", normKey: "学園", canonical: "学園", occurrences: 50 }), merged({})]);
    expect(batches[0]![0]!.kind).toBe("person");
    expect(kwic(lines, ["リン"])).toEqual(["0号:リンはここにいる", "4号:リンはここにいる", "8号:リンはここにいる"]);
  });

  it("requires one answer per term, Chinese only, and honours drop", () => {
    const batch = [merged({}), merged({ normKey: "ユキ", canonical: "ユキ" }), merged({ normKey: "アノ", canonical: "アノ" })];
    expect(fixSchema(batch).properties.items.minItems).toBe(3);
    const result = applyFixAnswer(JSON.stringify({ items: [
      { src: "リン", tgt: "琳", gender: "f", note_zh: "女主角", drop: false },
      { src: "ユキ", tgt: "ユキ", gender: "f", note_zh: "", drop: false },
      { src: "アノ", tgt: "那个", gender: "unknown", note_zh: "", drop: true },
    ] }), batch);
    expect(result.fixed.map((term) => [term.canonical, term.target, term.noteZh])).toEqual([["リン", "琳", "女主角"]]);
    expect(result.unanswered.map((term) => term.canonical)).toEqual(["ユキ"]);
    expect(result.dropped.map((term) => term.canonical)).toEqual(["アノ"]);
  });

  it("writes a gender only with three agreeing chunks and no disagreement", () => {
    expect(votedGender({ m: 0, f: 3, x: 0 })).toBe("f");
    expect(votedGender({ m: 1, f: 5, x: 0 })).toBe("unknown");
    expect(votedGender({ m: 0, f: 2, x: 0 })).toBe("unknown");
  });
});

describe("S7e freeze", () => {
  it("prefers locked and user entries, then votes, then the first occurrence, and reports shared names", () => {
    const { terms, conflicts } = resolveTerms([
      fixed({ target: "凛", votes: 5, firstPage: 1 }),
      fixed({ target: "琳", origin: "user", votes: 1, firstPage: 9 }),
      fixed({ normKey: "ユキ", canonical: "ユキ", target: "雪", votes: 2, firstPage: 3 }),
      fixed({ normKey: "ユキ", canonical: "ユキ", target: "由纪", votes: 2, firstPage: 2 }),
      fixed({ normKey: "ユイ", canonical: "ユイ", target: "由纪", votes: 1, firstPage: 4 }),
    ]);
    expect(terms.map((term) => term.target)).toEqual(["琳", "由纪", "由纪"]);
    expect(conflicts).toEqual([["ユキ", "ユイ"]]);
  });

  it("puts frequent people in the role table and hashes the snapshot deterministically", () => {
    const glossary = freezeGlossary([fixed({ gender: "f", noteZh: "女主角" }), fixed({ normKey: "ケン", canonical: "ケン", target: "健", occurrences: 1 })]);
    expect(glossary.roleTable).toEqual([{ source: "リン", target: "琳", note: "女，女主角" }]);
    expect(glossary.sha256).toBe(freezeGlossary([fixed({ gender: "f", noteZh: "女主角" }), fixed({ normKey: "ケン", canonical: "ケン", target: "健", occurrences: 1 })]).sha256);
  });
});

describe("matching and compliance", () => {
  const matcher = createMatcher([
    { surface: "リン", value: "rin" },
    { surface: "リン・ハート", value: "rin-heart" },
    { surface: "ハート", value: "heart" },
  ]);

  it("finds the longest non-overlapping matches", () => {
    expect(matcher.findAll("リン・ハートとリン").map((match) => match.value)).toEqual(["rin-heart", "rin"]);
    expect(matcher.findAll("なにもない")).toEqual([]);
  });

  it("reports names missing from a translation and repairs untranslated ones", () => {
    const rin = { surface: "リン", target: "琳", aliases: ["小琳"] };
    expect(missingTerms("小琳，过来", [rin])).toEqual([]);
    expect(missingTerms("林，过来", [rin])).toEqual([rin]);
    expect(replaceUntranslatedName("リン，过来", rin)).toBe("琳，过来");
    expect(replaceUntranslatedName("林，过来", rin)).toBeNull();
  });
});
