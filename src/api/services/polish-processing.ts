import { ollamaHost, ollamaTranslateModel, polishChunkPages } from "../../config.ts";
import { getLogger } from "../../logger.ts";
import type { TranslatedPage, TranslationOutput } from "../interfaces";
import type { OcrOutput } from "../../ocr/interfaces";
import { computeNumCtx, extractFirstJson } from "../utils";
import { loadContextTerms } from "./context-processing.ts";
import { clearExtractedTerms, loadTranslationOutput, saveTranslationOutput, resolveExtractedTermsFile } from "./translate-processing.ts";
import { existsSync, readFileSync } from "fs";

const logger = getLogger("polish");

// ── Polish logic ────────────────────────────────────────────────────────────

const loadExtractedTerms = (scope: string): Record<string, string> => {
  const file = resolveExtractedTermsFile(scope);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
};

interface PolishChunkInput {
  pages: Array<{
    pageNumber: number;
    original: Array<{ lineIndex: number; text: string }>;
    translated: Array<{ lineIndex: number; translated: string }>;
  }>;
}

const buildPolishSystemPrompt = (
  targetLanguage: string,
  uploadId: string | undefined,
): string => {
  const allContextTerms = uploadId ? loadContextTerms(uploadId) : [];
  const termsWithContext = allContextTerms.filter((t) => t.context.trim());
  const termsWithoutContext = allContextTerms.filter((t) => !t.context.trim());

  let glossarySection = "";
  if (termsWithContext.length > 0) {
    glossarySection += `\nGLOSSARY — story terms with translation context:\n${termsWithContext.map((t) => `- ${t.term}: ${t.context}`).join("\n")}\n`;
  }
  if (termsWithoutContext.length > 0) {
    glossarySection += `\nKNOWN TERMS — story-specific terms:\n${termsWithoutContext.map((t) => `- ${t.term}`).join("\n")}\n`;
  }

  const extractedTerms = uploadId ? loadExtractedTerms(uploadId) : {};
  const glossaryTermSet = new Set(allContextTerms.map((t) => t.term));
  const filteredExtracted = Object.entries(extractedTerms)
    .filter(([src]) => !glossaryTermSet.has(src));

  let extractedSection = "";
  if (filteredExtracted.length > 0) {
    extractedSection = `\nESTABLISHED TRANSLATIONS — terms from earlier pages:\n${filteredExtracted.map(([src, trl]) => `- ${src} → ${trl}`).join("\n")}\n`;
  }

  return `You are a professional manga/comic translation editor. You will receive a batch of pages with their ORIGINAL text and CURRENT translations in ${targetLanguage}. Your task is to POLISH the translations.
${glossarySection}${extractedSection}
JAPANESE PUNCTUATION & TONE MARKERS — check the original text for these and verify the translation handles them correctly:
- "……" or "…" = hesitation, trailing off, or pause. The translation should convey the emotion, not mechanically copy dots. Use "……" in ${targetLanguage} only when the pause is dramatically important.
- "〜" (wave dash) = elongated/drawn-out sound (e.g. "か〜ね" = "かね" said lazily/playfully). The translated WORD should be natural; the lazy/playful tone should come from word choice, not from copying "〜".
- "ー" (chōon) = vowel lengthening. The word should be translated naturally with appropriate emphasis.
- "っ" (small tsu) at end = abrupt cut-off or stutter. Should appear as a cut-off in ${targetLanguage} (e.g. "什——").
- "♥" / "♪" = should be preserved as-is.
- If a translation has excessive "……" or "〜" copied from the original, replace with natural ${targetLanguage} phrasing that preserves the same emotional nuance.

SPEECH BUBBLE LINE BREAKS — critical for manga layout:
- Each lineIndex corresponds to a separate speech bubble or text block in the image. The translation for each lineIndex MUST be a self-contained, readable segment that fits its own bubble.
- Do NOT merge the meaning of two bubbles into one line and leave the other empty or redundant.
- Do NOT split a single short phrase across multiple lines if it belongs to one bubble.
- If the original has a sentence broken across two bubbles (two lineIndexes), the translation should also break naturally across those two lines — e.g. line 0: "虽然我很想帮你" line 1: "但现在不行" rather than line 0: "虽然我很想帮你但现在不行" line 1: "".
- Check for translations where one line got all the content and adjacent lines became empty or near-empty — redistribute the meaning to match the original line structure.

INTRA-BUBBLE LINE BREAKS — re-check line wrapping within each bubble:
- A single translated line may need internal line breaks (use \\n) to fit visually inside a speech bubble.
- Different languages have different natural break points. Japanese breaks at particles/clause boundaries; ${targetLanguage} may break differently. Re-evaluate where \\n should go based on ${targetLanguage} grammar and reading rhythm.
- Break long translations into 2-3 short visual lines using \\n. Aim for roughly even line lengths.
- Break at natural clause boundaries, punctuation, or breath pauses — never mid-word.
- If the original text already contains line breaks, do NOT copy them blindly — find the natural ${targetLanguage} break points instead.
- Short translations (under ~8 characters) generally need no \\n.
- Example: "我真的很喜欢你\\n但是我不能和你在一起" is better than "我真的很喜欢你但是我不能和你在一起" for bubble readability.

POLISHING RULES:
- Review each page's translation against the original text and the surrounding pages.
- Fix awkward, unnatural, or overly literal phrasing to sound natural in ${targetLanguage}.
- Ensure character voice consistency — each character's speech style should remain stable.
- Ensure term consistency — the same names, places, techniques must use the same ${targetLanguage} translation throughout.
- Adapt cultural references when the literal translation would confuse a ${targetLanguage} reader.
- Keep translations concise — they must fit inside speech bubbles.
- Preserve the emotional tone (casual, shouted, whispering, formal, etc.).
- When translations in GLOSSARY or ESTABLISHED TRANSLATIONS exist, use them for consistency.
- If a translation is already good, keep it unchanged.
- Every lineIndex from the input MUST appear in the output, even if unchanged.

OUTPUT FORMAT — output ONLY valid JSON, no markdown, no explanation:
{"pages": [{"pageNumber": <number>, "lines": [{"lineIndex": <number>, "translated": "<polished string>"}, ...]}, ...]}

All pages from the input must appear in the output, in the same order.`;
};

const callOllamaPolishChunk = async (
  chunk: PolishChunkInput,
  targetLanguage: string,
  model: string | undefined,
  uploadId: string | undefined,
): Promise<TranslatedPage[]> => {
  const systemPrompt = buildPolishSystemPrompt(targetLanguage, uploadId);
  const userMessage = JSON.stringify(chunk);

  const response = await fetch(`${ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10 * 60 * 1000), // 10 minutes per chunk (multiple pages)
    body: JSON.stringify({
      model: model ?? ollamaTranslateModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
      format: "json",
      think: false,
      options: {
        num_predict: -1,
        num_ctx: computeNumCtx(systemPrompt, userMessage),
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama API error ${response.status}: ${errText}`);
  }

  let rawContent = "";
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunkData = JSON.parse(line) as { message?: { content?: string } };
      if (chunkData.message?.content) rawContent += chunkData.message.content;
    }
  }
  if (buffer.trim()) {
    const chunkData = JSON.parse(buffer) as { message?: { content?: string } };
    if (chunkData.message?.content) rawContent += chunkData.message.content;
  }

  const parsed = extractFirstJson(rawContent) as {
    pages?: Array<{ pageNumber: number; lines: Array<{ lineIndex: number; translated: string }> }>;
  } | null;

  if (!parsed || !Array.isArray(parsed.pages)) {
    throw new Error(`No valid polish output for chunk (pages ${chunk.pages.map((p) => p.pageNumber).join(", ")})`);
  }

  return parsed.pages.map((p) => ({
    pageNumber: p.pageNumber,
    lines: (p.lines ?? [])
      .filter((l) => typeof l.lineIndex === "number" && typeof l.translated === "string")
      .map((l) => ({ lineIndex: l.lineIndex, translated: l.translated })),
  }));
};

export const polishAll = async (
  ocrOutput: OcrOutput,
  translationOutput: TranslationOutput,
  targetLanguage: string,
  onChunkDone?: (polished: TranslatedPage[]) => void,
  model?: string,
  uploadId?: string,
): Promise<TranslationOutput> => {
  const translationMap = new Map(translationOutput.map((p) => [p.pageNumber, p]));
  const ocrMap = new Map(ocrOutput.pages.map((p) => [p.pageNumber, p]));

  // Build page inputs: only pages that have both OCR and translation
  const pageInputs: PolishChunkInput["pages"] = [];
  for (const page of ocrOutput.pages) {
    const translation = translationMap.get(page.pageNumber);
    if (!translation || translation.lines.length === 0) continue;
    pageInputs.push({
      pageNumber: page.pageNumber,
      original: page.lines.map((l) => ({ lineIndex: l.lineIndex, text: l.text })),
      translated: translation.lines,
    });
  }

  if (pageInputs.length === 0) return translationOutput;

  // Clear extracted terms before polishing to prevent unbounded growth
  // across multiple polish runs. The terms were only needed during initial
  // translation; after polish the translations themselves are canonical.
  if (uploadId) clearExtractedTerms(uploadId);

  // Chunk pages
  const chunkSize = polishChunkPages === -1 ? pageInputs.length : polishChunkPages;
  const chunks: PolishChunkInput[] = [];
  for (let i = 0; i < pageInputs.length; i += chunkSize) {
    chunks.push({ pages: pageInputs.slice(i, i + chunkSize) });
  }

  logger.info(`Polishing ${pageInputs.length} page(s) in ${chunks.length} chunk(s) of up to ${chunkSize}`);

  const polishedMap = new Map(translationOutput.map((p) => [p.pageNumber, p]));

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const pageNums = chunk.pages.map((p) => p.pageNumber);
    logger.info(`Chunk ${ci + 1}/${chunks.length}: pages ${pageNums.join(", ")}`);

    let result: TranslatedPage[] | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await callOllamaPolishChunk(chunk, targetLanguage, model, uploadId);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < 3) {
          logger.warn(`Chunk ${ci + 1} attempt ${attempt} failed: ${msg}, retrying...`);
        } else {
          logger.error(`Chunk ${ci + 1} failed after 3 attempts: ${msg}`);
        }
      }
    }

    if (!result) {
      // On failure, keep original translations for this chunk
      onChunkDone?.(chunk.pages.map((p) => polishedMap.get(p.pageNumber)!).filter(Boolean));
      continue;
    }

    // Merge polished pages, validating line indices against originals.
    // For any lineIndex present in the original but missing or invalid in the
    // polished output, keep the original translation to prevent data loss.
    for (const polishedPage of result) {
      const originalTranslation = translationMap.get(polishedPage.pageNumber);
      if (!originalTranslation) continue;
      const originalLineMap = new Map(originalTranslation.lines.map((l) => [l.lineIndex, l]));
      const validIndices = new Set(originalLineMap.keys());

      // Build a map of polished lines by lineIndex
      const polishedLineMap = new Map<number, { lineIndex: number; translated: string }>();
      for (const l of polishedPage.lines) {
        if (typeof l.lineIndex === "number" && typeof l.translated === "string" && validIndices.has(l.lineIndex)) {
          polishedLineMap.set(l.lineIndex, { lineIndex: l.lineIndex, translated: l.translated });
        }
      }

      // Merge: use polished line if available, otherwise keep original
      const mergedLines = [...validIndices].sort((a, b) => a - b).map((idx) => {
        const polished = polishedLineMap.get(idx);
        if (polished) return polished;
        const orig = originalLineMap.get(idx)!;
        return { lineIndex: orig.lineIndex, translated: orig.translated };
      });

      polishedMap.set(polishedPage.pageNumber, { pageNumber: polishedPage.pageNumber, lines: mergedLines });
    }

    onChunkDone?.(result);
  }

  // Return in original page order
  return ocrOutput.pages
    .map((p) => polishedMap.get(p.pageNumber))
    .filter((p): p is TranslatedPage => p !== undefined);
};
