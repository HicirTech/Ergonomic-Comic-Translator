import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { ollamaHost, ollamaTranslateModel, translateContextPages, translatedRootDir } from "../../config.ts";
import { resolveOutputFileForScope } from "../../ocr/runtime-context.ts";
import type { OcrOutput, OcrPage } from "../../ocr/interfaces";
import { getLogger } from "../../logger.ts";
import type { TranslatedLine, TranslatedPage, TranslationOutput } from "../interfaces";
import { computeNumCtx, extractFirstObject } from "../utils";
import { loadContextTerms } from "./context-processing.ts";

export const resolveTranslatedDir = (scope: string) =>
  resolve(translatedRootDir, scope);

export const resolveTranslatedOutputFile = (scope: string) =>
  resolve(resolveTranslatedDir(scope), "translated.json");

export const resolveExtractedTermsFile = (scope: string) =>
  resolve(resolveTranslatedDir(scope), "extracted-terms.json");

/** Load accumulated auto-extracted term mappings (source → translated). */
const loadExtractedTerms = (scope: string): Record<string, string> => {
  const file = resolveExtractedTermsFile(scope);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
};

/** Remove the extracted-terms file (e.g. before polish regenerates it). */
export const clearExtractedTerms = (scope: string): void => {
  const file = resolveExtractedTermsFile(scope);
  if (existsSync(file)) {
    writeFileSync(file, JSON.stringify({}, null, 2), "utf8");
  }
};

/** Merge new terms into the accumulated file on disk. */
const saveExtractedTerms = (scope: string, newTerms: Record<string, string>): void => {
  if (Object.keys(newTerms).length === 0) return;
  const existing = loadExtractedTerms(scope);
  const merged = { ...existing, ...newTerms };
  const dir = resolveTranslatedDir(scope);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolveExtractedTermsFile(scope), JSON.stringify(merged, null, 2), "utf8");
};

export const loadOcrOutputForTranslate = (scope: string): OcrOutput | null => {
  const ocrFile = resolveOutputFileForScope(scope);
  if (!existsSync(ocrFile)) {
    return null;
  }
  return JSON.parse(readFileSync(ocrFile, "utf8")) as OcrOutput;
};

export const loadTranslationOutput = (scope: string): TranslationOutput | null => {
  const file = resolveTranslatedOutputFile(scope);
  if (!existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8")) as TranslationOutput;
};

export const saveTranslationOutput = (scope: string, output: TranslationOutput): string => {
  const outputFile = resolveTranslatedOutputFile(scope);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf8");
  return outputFile;
};



const buildSystemPrompt = (targetLanguage: string, translatedSoFar: TranslationOutput, uploadId?: string): string => {
  // Sliding window: only send the most recent N translated pages as context to keep the
  // system prompt size stable regardless of how many pages have already been translated.
  const windowedTranslations = translateContextPages === -1
    ? translatedSoFar
    : translatedSoFar.slice(-translateContextPages);

  // Build glossary sections from extracted context terms.
  // Terms with explanations provide authoritative translation guidance.
  // Terms without explanations are still listed so the model keeps them consistent.
  const allContextTerms = uploadId ? loadContextTerms(uploadId) : [];
  const termsWithContext = allContextTerms.filter((t) => t.context.trim());
  const termsWithoutContext = allContextTerms.filter((t) => !t.context.trim());

  let glossarySection = "";
  if (termsWithContext.length > 0) {
    glossarySection += `\nGLOSSARY — story terms with translation context (use these for accurate translation):\n${termsWithContext.map((t) => `- ${t.term}: ${t.context}`).join("\n")}\n`;
  }
  if (termsWithoutContext.length > 0) {
    glossarySection += `\nKNOWN TERMS — story-specific terms to keep consistent (transliterate or preserve as appropriate):\n${termsWithoutContext.map((t) => `- ${t.term}`).join("\n")}\n`;
  }

  // Auto-extracted terms from previous pages — provides cross-page consistency beyond
  // the sliding window.  User GLOSSARY entries take priority over these.
  const glossaryTermSet = new Set(allContextTerms.map((t) => t.term));
  const extractedTerms = uploadId ? loadExtractedTerms(uploadId) : {};
  const filteredExtracted = Object.entries(extractedTerms)
    .filter(([src]) => !glossaryTermSet.has(src));

  let extractedSection = "";
  if (filteredExtracted.length > 0) {
    extractedSection = `\nESTABLISHED TRANSLATIONS — terms you translated on earlier pages (maintain consistency):\n${filteredExtracted.map(([src, trl]) => `- ${src} → ${trl}`).join("\n")}\n`;
  }

  return `You are a professional manga/comic translator. Translate ONLY the page specified in the user message to ${targetLanguage}.

ALREADY TRANSLATED — last ${windowedTranslations.length} pages (for tone/term consistency — do NOT re-translate these):
${windowedTranslations.length > 0 ? JSON.stringify(windowedTranslations) : "(none yet)"}
${glossarySection}${extractedSection}
JAPANESE PUNCTUATION & TONE MARKERS — how to handle them:
- "……" or "…" = hesitation, trailing off, or pause. Translate the underlying emotion, not the dots literally. Use "……" sparingly in ${targetLanguage} only when the pause is dramatically significant.
- "〜" (wave dash) after a syllable = elongated/drawn-out sound (e.g. "か〜ね" = "かね" said lazily). Translate the WORD naturally; convey the lazy/playful tone through word choice, not by copying "〜".
- "ー" (chōon) = vowel lengthening for emphasis or tone. Interpret the word it belongs to, then translate naturally.
- "っ" (small tsu) at end = abrupt cut-off or stutter. Reflect this as a cut-off in ${targetLanguage} (e.g. "什——").
- "♥" / "♪" = keep these symbols as-is in the translation.
- Repeated punctuation ("！！！", "？？") = intensity. Preserve the emphasis but don't over-duplicate.
- These markers carry TONAL information — do NOT ignore them, but do NOT transliterate them mechanically. Convert the emotion they convey into natural ${targetLanguage} expression.

SPEECH BUBBLE LINE BREAKS:
- Each lineIndex corresponds to a separate speech bubble or text block in the image.
- Translate each lineIndex independently so the translation fits its own bubble.
- Do NOT merge the content of multiple lines into one and leave others empty.
- If the original splits a sentence across two lines, the translation should split naturally across those same two lines.

RULES:
- Output ONLY valid JSON in the exact format below. No markdown, no explanation.
- Keep character names, terms, and tone consistent with already-translated pages above.
- Preserve speech style (casual, shouted, whispering, formal, etc.)
- Keep translations concise — they fit inside speech bubbles.
- Every lineIndex from the input page must appear in the output.
- When translating terms listed in the GLOSSARY, use the provided explanation as authoritative context.
- When translating KNOWN TERMS with no explanation, keep them consistent with any prior translations of those terms.
- When translating terms listed in ESTABLISHED TRANSLATIONS, use the same translation for consistency.
- In the "terms" field, list ONLY proper nouns (character names, place names, organization names) and recurring important terms (techniques, titles, catchphrases) that appear on this page, with their ${targetLanguage} translations. Do NOT include common words.

REQUIRED OUTPUT FORMAT:
{"pageNumber": <number>, "lines": [{"lineIndex": <number>, "translated": "<string>"}, ...], "terms": {"<source_term>": "<${targetLanguage}_translation>", ...}}

EXAMPLE:
{"pageNumber": 3, "lines": [{"lineIndex": 0, "translated": "什么事？"}, {"lineIndex": 1, "translated": "别过来！"}], "terms": {"太郎": "太郎", "必殺技": "必杀技"}}`;
};

const callOllamaPage = async (
  page: OcrPage,
  translatedSoFar: TranslationOutput,
  targetLanguage: string,
  model?: string,
  uploadId?: string,
): Promise<{ pageNumber: number; lines: Array<{ lineIndex: number; translated: string }> }> => {
  const inputLines = page.lines.map((l) => ({
    lineIndex: l.lineIndex,
    translated: l.text,
  }));

  const systemPrompt = buildSystemPrompt(targetLanguage, translatedSoFar, uploadId);
  const userMessage = JSON.stringify({ pageNumber: page.pageNumber, lines: inputLines });

  const response = await fetch(`${ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minutes per page
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
      const chunk = JSON.parse(line) as { message?: { content?: string } };
      if (chunk.message?.content) rawContent += chunk.message.content;
    }
  }
  if (buffer.trim()) {
    const chunk = JSON.parse(buffer) as { message?: { content?: string } };
    if (chunk.message?.content) rawContent += chunk.message.content;
  }

  const parsed = extractFirstObject(rawContent) as { pageNumber: number; lines: Array<{ lineIndex: number; translated: string }>; terms?: Record<string, string> } | null;
  if (!parsed || typeof parsed.pageNumber !== "number" || !Array.isArray(parsed.lines)) {
    throw new Error(`No valid page object in response for page ${page.pageNumber}`);
  }
  const validIndices = new Set(inputLines.map((l) => l.lineIndex));

  // Accumulate auto-extracted terms to disk for cross-page consistency.
  if (uploadId && parsed.terms && typeof parsed.terms === "object") {
    const cleanTerms: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.terms)) {
      if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
        cleanTerms[k.trim()] = v.trim();
      }
    }
    saveExtractedTerms(uploadId, cleanTerms);
  }

  return {
    pageNumber: parsed.pageNumber ?? page.pageNumber,
    lines: (parsed.lines ?? [])
      .filter((l) => validIndices.has(l.lineIndex) && typeof l.translated === "string")
      .map((l) => ({ lineIndex: l.lineIndex, translated: l.translated })),
  };
};

export const translateAll = async (
  pages: OcrPage[],
  targetLanguage: string,
  onPageDone?: (result: TranslatedPage) => void,
  model?: string,
  uploadId?: string,
  initialTranslations?: TranslationOutput,
): Promise<TranslationOutput> => {
  if (pages.length === 0) return [];

  // Pre-seed already-translated pages so the sliding-window context in the system prompt
  // reflects prior translated pages even when retranslating a single page mid-volume.
  const translateSet = new Set(pages.map((p) => p.pageNumber));
  const seeded = (initialTranslations ?? []).filter((p) => !translateSet.has(p.pageNumber));
  const output: TranslationOutput = [...seeded];

  for (const page of pages) {
    if (page.lines.length === 0) {
      const empty: TranslatedPage = { pageNumber: page.pageNumber, lines: [] };
      output.push(empty);
      onPageDone?.(empty);
      continue;
    }

    let result: TranslatedPage | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const translated = await callOllamaPage(page, output, targetLanguage, model, uploadId);
        result = { pageNumber: page.pageNumber, lines: translated.lines };
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const logger = getLogger("translate");
        if (attempt < 3) {
          logger.warn(`Page ${page.pageNumber} attempt ${attempt} failed: ${msg}, retrying...`);
        } else {
          logger.error(`Page ${page.pageNumber} failed after 3 attempts: ${msg}`);
        }
      }
    }

    if (result) {
      output.push(result);
      onPageDone?.(result);
    }
  }

  return output;
};
