import type { ChatResult } from "../llm/interfaces/index.ts";
import type { TranslationUnit } from "../translate/interfaces/index.ts";
import type { CheckCode, PageCheck } from "./interfaces/index.ts";

/**
 * Refusal and meta talk, per language the model might fall into. A match only counts when the source
 * has no such expression itself (a character who says "I can't" must still be translated as such).
 */
const refusalPatterns = [
  /作为(一个)?\s*(AI|人工智能)/iu,
  /语言模型/u,
  /无法(为你|为您)?(提供)?翻译/u,
  /内容政策/u,
  /不(适当|恰当)的内容/u,
  /^注[:：]/mu,
  /以下(为|是)翻译/u,
  /AIとして/u,
  /翻訳できません/u,
  /不適切な内容/u,
  /AI로서/u,
  /번역할 수 없/u,
  /\bas an AI\b/iu,
  /\bI (can't|cannot) (translate|assist|help)/iu,
  /\bcontent policy\b/iu,
];

const kanaOrHangul = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** Marks a Chinese rendering may legitimately keep: the long-vowel dash in stretched sounds. */
const keepableMarks = /[ー〜～]/gu;
/** Output whose most repeated 1-4-gram occurs this many more times than the source's most repeated one is degenerate. */
const repeatExcess = 8;

const normalize = (text: string) => text.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

const ngramCounts = (text: string) => {
  const chars = [...text];
  const counts = new Map<string, number>();
  for (let size = 1; size <= 4; size += 1) {
    for (let index = 0; index + size <= chars.length; index += 1) {
      const gram = `${size}:${chars.slice(index, index + size).join("")}`;
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
};

const maxRepeat = (text: string) => Math.max(0, ...ngramCounts(text).values());

/**
 * G5: the target repeats something far more often than the source repeats anything. Compared by count,
 * not by n-gram, because translation changes the characters (a long ああああ legitimately becomes 啊啊啊啊).
 */
export const isDegenerate = (source: string, target: string) => maxRepeat(target) - maxRepeat(source) >= repeatExcess;

/** G1: refusal or meta language in the target that the source does not contain. */
export const isRefusal = (source: string, target: string) =>
  refusalPatterns.some((pattern) => pattern.test(target) && !pattern.test(source));

/** G1b: the "translation" is the source again (after normalising width, spacing and punctuation). */
export const isEcho = (source: string, target: string) => {
  const normalizedSource = normalize(source);
  return normalizedSource.length > 0 && normalize(target) === normalizedSource && /[\p{L}]/u.test(normalizedSource);
};

/** G3: Japanese kana or Korean hangul left in a Chinese translation (SFX keep their lettering elsewhere). */
export const hasResidue = (target: string) => kanaOrHangul.test(target.replace(keepableMarks, ""));

/**
 * Checks one completion against the units it was asked to translate. Structure failures concern the
 * whole response; unit failures name the ids to request again. `postDict` (the target-side dictionary,
 * e.g. names the model left untranslated) is applied to each value before the content checks.
 */
export const checkCompletion = (
  units: readonly TranslationUnit[],
  result: ChatResult,
  postDict: (unit: TranslationUnit, target: string) => string = (_, target) => target,
): PageCheck => {
  const pageFailures: CheckCode[] = [];
  if (result.reasoningContent.trim() !== "" || /<think>/iu.test(result.content)) pageFailures.push("G0_REASONING");
  if (result.finishReason === "length") pageFailures.push("G0_TRUNCATED");

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    pageFailures.push("G0_JSON");
  }
  const record = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  if (parsed !== null && !record) pageFailures.push("G0_JSON");

  const ids = new Set(units.map((unit) => unit.id));
  const targets: Record<string, string> = {};
  const unitFailures: Record<string, CheckCode[]> = {};
  if (record) {
    if (Object.keys(record).some((key) => !ids.has(key))) pageFailures.push("G0_KEYS");
    for (const unit of units) {
      const raw = record[unit.id];
      const value = typeof raw === "string" && raw.trim() !== "" ? postDict(unit, raw) : raw;
      const failures: CheckCode[] = [];
      if (typeof value !== "string") {
        failures.push("G0_KEYS");
      } else if (value.trim() === "") {
        failures.push("G0_EMPTY");
      } else {
        targets[unit.id] = value;
        if (isRefusal(unit.source, value)) failures.push("G1_REFUSAL");
        if (isEcho(unit.source, value)) failures.push("G1B_ECHO");
        if (unit.kind !== "sfx" && hasResidue(value)) failures.push("G3_RESIDUE");
        if (isDegenerate(unit.source, value)) failures.push("G5_REPEAT");
      }
      if (failures.length > 0) unitFailures[unit.id] = failures;
    }
  }

  const structural = pageFailures.includes("G0_JSON") || pageFailures.includes("G0_TRUNCATED") || pageFailures.includes("G0_REASONING");
  const retryIds = structural ? units.map((unit) => unit.id) : Object.keys(unitFailures);
  return { targets: structural ? {} : targets, pageFailures, unitFailures, retryIds };
};
