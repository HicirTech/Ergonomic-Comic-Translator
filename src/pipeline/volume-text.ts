import { readingOrder } from "../stages/order/reading-order.ts";
import type { SourceLine } from "../terms/interfaces/index.ts";
import { unitId } from "../translate/contract.ts";
import type { TranslationUnit } from "../translate/interfaces/index.ts";
import type { RegionResult, VolumePageText } from "./interfaces/index.ts";

const unitKind = (region: RegionResult, utterance: RegionResult["utterances"][number]): TranslationUnit["kind"] => {
  if (utterance.nameTag) return "name_tag";
  if (utterance.thought || region.classification.kind === "thought") return "thought";
  if (region.classification.layout === "bottom_box") return "narration";
  return region.classification.kind === "free_text" ? "free_text" : region.classification.kind === "sfx" ? "sfx" : "dialogue";
};

/**
 * Turns one page's vision result into translation units: regions in reading order, one unit per utterance
 * with text, ids "12" or "12a"/"12b". Kept SFX and utterances without text are not translated.
 */
export const pageText = (page: number, regions: readonly RegionResult[], direction: "rtl" | "ltr"): VolumePageText => {
  const order = readingOrder(regions.map((region) => region.box), direction);
  const units: TranslationUnit[] = [];
  const lines: SourceLine[] = [];
  const refs: VolumePageText["refs"] = {};
  order.forEach((regionIndex, position) => {
    const region = regions[regionIndex]!;
    if (region.classification.policy === "keep") return;
    const readable = region.utterances.map((utterance, utteranceIndex) => ({ utterance, utteranceIndex })).filter(({ utterance }) => utterance.text.trim() !== "");
    readable.forEach(({ utterance, utteranceIndex }, index) => {
      const id = unitId(position + 1, index, readable.length);
      units.push({ id, kind: unitKind(region, utterance), source: utterance.text.trim() });
      lines.push({ id: `${page}.${position + 1}.${index}`, page, text: utterance.text.trim(), nameTag: utterance.nameTag });
      refs[id] = { regionIndex, utteranceIndex };
    });
  });
  return { page, units, lines, refs };
};
