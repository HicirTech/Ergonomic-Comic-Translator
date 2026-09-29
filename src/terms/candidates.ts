import type { SourceLanguage } from "../translate/interfaces/index.ts";
import type { SourceLine, TermCandidate, TermSignal } from "./interfaces/index.ts";
import { japaneseHonorifics, koreanHonorifics, normKey } from "./norm-key.ts";

const katakanaRun = /[ァ-ヶー・]{2,}/gu;
const japaneseHonorificName = new RegExp(`[\\p{sc=Han}\\p{sc=Katakana}\\p{sc=Hiragana}]{1,6}(?:${japaneseHonorifics.join("|")})`, "gu");
const koreanHonorificName = new RegExp(`[가-힣]{1,4}(?:${koreanHonorifics.join("|")})`, "gu");
const quotedPhrase = /[「『【]([^」』】]{2,12})[」』】]/gu;
const capitalisedWord = /(?<=[a-z,;:]\s+)[A-Z][a-z]{2,}/gu;
/** Stretched spellings and anything with sentence punctuation are not names. */
const rejected = /[～〜~。、！？!?,.…]/u;

type Hit = { surface: string; signal: TermSignal };

const hitsOf = (line: SourceLine, language: SourceLanguage): Hit[] => {
  const text = line.text.normalize("NFKC");
  const hits: Hit[] = [];
  const collect = (pattern: RegExp, signal: TermSignal, group = 0) => {
    for (const match of text.matchAll(pattern)) hits.push({ surface: match[group]!, signal });
  };
  if (line.nameTag) {
    hits.push({ surface: text.replace(/^[【\[]|[】\]:：]$/gu, "").trim(), signal: "nametag" });
  }
  switch (language) {
    case "ja":
      collect(katakanaRun, "kata");
      collect(japaneseHonorificName, "honor");
      collect(quotedPhrase, "quote", 1);
      break;
    case "ko":
      collect(koreanHonorificName, "honor");
      break;
    case "zh-Hant":
      collect(quotedPhrase, "quote", 1);
      break;
    case "en":
      collect(capitalisedWord, "capital");
      break;
  }
  return hits.filter((hit) => hit.surface.length > 0 && !rejected.test(hit.surface));
};

/** Signals that make a single occurrence enough; everything else must appear at least twice. */
const strongSignals: ReadonlySet<TermSignal> = new Set(["honor", "nametag"]);

/**
 * S7a: rule-based candidates over the whole volume (no model). Katakana runs, names with honorifics,
 * short quoted phrases, name tags; single characters only with an honorific or on a name tag.
 */
export const findCandidates = (lines: readonly SourceLine[], language: SourceLanguage): TermCandidate[] => {
  const byKey = new Map<string, TermCandidate>();
  for (const line of lines) {
    for (const hit of hitsOf(line, language)) {
      const key = normKey(hit.surface);
      if ([...key].length < 2 && !strongSignals.has(hit.signal)) continue;
      const candidate = byKey.get(key) ?? { normKey: key, surfaces: [], pages: [], count: 0, signals: [] };
      if (!candidate.surfaces.includes(hit.surface)) candidate.surfaces.push(hit.surface);
      if (!candidate.pages.includes(line.page)) candidate.pages.push(line.page);
      if (!candidate.signals.includes(hit.signal)) candidate.signals.push(hit.signal);
      candidate.count += 1;
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()].filter((candidate) => candidate.count >= 2 || candidate.signals.some((signal) => strongSignals.has(signal)));
};
