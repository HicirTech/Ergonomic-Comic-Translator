import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { ollamaHost, ollamaTranslateModel, translateContextPages, translatedRootDir, memoryTmMaxChars } from "../../config.ts";
import { resolveOutputFileForScope } from "../../ocr/runtime-context.ts";
import type { OcrOutput, OcrPage } from "../../ocr/interfaces";
import { getLogger } from "../../logger.ts";
import type { TranslatedLine, TranslatedPage, TranslationOutput } from "../interfaces";
import { loadContextTerms } from "./context-processing.ts";
import { runMemoryCli } from "../../scripts/python-run.ts";

export const resolveTranslatedDir = (scope: string) =>
  resolve(translatedRootDir, scope);

export const resolveTranslatedOutputFile = (scope: string) =>
  resolve(resolveTranslatedDir(scope), "translated.json");

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

// Extract the first complete `{...}` JSON object from a string, tolerating surrounding text.
// Pre-cleans the input: strips <think>…</think> blocks, markdown fences, and fixes bare
// control characters (literal newlines/tabs) inside JSON string values that would otherwise
// cause JSON.parse to throw.

const cleanRawResponse = (raw: string): string => {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1");
  return s.replace(/\r/g, "").trim();
};

const sanitizeJsonControlChars = (fragment: string): string => {
  let result = "";
  let inStr = false, esc = false;
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    const code = ch.charCodeAt(0);
    if (esc) { esc = false; result += ch; continue; }
    if (ch === "\\" && inStr) { esc = true; result += ch; continue; }
    if (ch === '"') { inStr = !inStr; result += ch; continue; }
    if (inStr && code < 0x20) {
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    result += ch;
  }
  return result;
};

const extractFirstObject = (raw: string): unknown => {
  const cleaned = cleanRawResponse(raw);
  let i = 0;
  while (i < cleaned.length) {
    while (i < cleaned.length && cleaned[i] !== "{") i++;
    if (i >= cleaned.length) break;
    let depth = 0, inStr = false, esc = false;
    const start = i;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (esc) { esc = false; i++; continue; }
      if (ch === "\\" && inStr) { esc = true; i++; continue; }
      if (ch === '"') { inStr = !inStr; i++; continue; }
      if (inStr) { i++; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const fragment = cleaned.slice(start, i + 1);
          try { return JSON.parse(fragment); } catch { /* try sanitized version */ }
          try { return JSON.parse(sanitizeJsonControlChars(fragment)); } catch { /* try next */ }
          i++; break;
        }
      }
      i++;
    }
  }
  const logger = getLogger("translate");
  const preview = cleaned.slice(0, 300).replace(/\n/g, "\\n");
  logger.warn(`extractFirstObject: no valid JSON found. Preview: ${preview}`);
  return null;
};

/**
 * Estimate prompt token count (chars / 3 for CJK-heavy text, conservative)
 * and round up to the next power of 2, clamped to [4096, 131072].
 * This keeps KV-cache allocation proportional to actual content rather than
 * always reserving 256K tokens for a payload that may only need 8K.
 */
const computeNumCtx = (systemPrompt: string, userMessage: string): number => {
  const estimated = Math.ceil((systemPrompt.length + userMessage.length) / 3);
  // Round up to next power of 2, minimum 4096, maximum 131072
  let ctx = 4096;
  while (ctx < estimated * 2) ctx *= 2; // 2× headroom for the response
  return Math.min(Math.max(ctx, 4096), 131072);
};

/** Maximum characters of page OCR text to include in the memory search query. */
const MEMORY_QUERY_MAX_LENGTH = 300;
/** Minimum similarity score (0–1) for a memory snippet to be injected into the translation prompt. */
const MEMORY_SNIPPET_MIN_SCORE = 0.75;

const buildSystemPrompt = (targetLanguage: string, translatedSoFar: TranslationOutput, uploadId?: string, memorySnippets?: string[]): string => {
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

  let memorySection = "";
  if (memorySnippets && memorySnippets.length > 0) {
    memorySection = `\nPERSISTENT MEMORY — translation knowledge from previous sessions (apply where relevant):\n${memorySnippets.map((s) => `- ${s}`).join("\n")}\n`;
  }

  return `You are a professional manga/comic translator. Translate ONLY the page specified in the user message to ${targetLanguage}.

ALREADY TRANSLATED — last ${windowedTranslations.length} pages (for tone/term consistency — do NOT re-translate these):
${windowedTranslations.length > 0 ? JSON.stringify(windowedTranslations) : "(none yet)"}
${glossarySection}${memorySection}
RULES:
- Output ONLY valid JSON in the exact format below. No markdown, no explanation.
- Keep character names, terms, and tone consistent with already-translated pages above.
- Preserve speech style (casual, shouted, whispering, formal, etc.)
- Keep translations concise — they fit inside speech bubbles.
- Every lineIndex from the input page must appear in the output.
- When translating terms listed in the GLOSSARY, use the provided explanation as authoritative context.
- When translating KNOWN TERMS with no explanation, keep them consistent with any prior translations of those terms.
- When translating terms found in PERSISTENT MEMORY, apply those established translations for consistency.

REQUIRED OUTPUT FORMAT:
{"pageNumber": <number>, "lines": [{"lineIndex": <number>, "translated": "<string>"}, ...]}

EXAMPLE:
{"pageNumber": 3, "lines": [{"lineIndex": 0, "translated": "什么事？"}, {"lineIndex": 1, "translated": "别过来！"}]}`;
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

  // ── Memory: fetch relevant snippets to inject into the system prompt ────────
  // Only performed when an uploadId is available so the search is scoped to this
  // upload — without uploadId the query would be unscoped/global.
  let memorySnippets: string[] | undefined;
  const pageText = page.lines.map((l) => l.text.trim()).filter(Boolean).join(" ");
  if (pageText && uploadId) {
    const memResult = await runMemoryCli([
      "search",
      "--query", `manga translation ${targetLanguage}: ${pageText.slice(0, MEMORY_QUERY_MAX_LENGTH)}`,
      "--limit", "5",
      "--user-id", uploadId,
    ]) as { results?: Array<{ memory?: string; score?: number }> } | null;
    const hits = (memResult?.results ?? [])
      .filter((r) => r.memory && (r.score ?? 0) >= MEMORY_SNIPPET_MIN_SCORE)
      .map((r) => r.memory as string);
    if (hits.length > 0) memorySnippets = hits;
  }

  const systemPrompt = buildSystemPrompt(targetLanguage, translatedSoFar, uploadId, memorySnippets);
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

  const parsed = extractFirstObject(rawContent) as { pageNumber: number; lines: Array<{ lineIndex: number; translated: string }> } | null;
  if (!parsed || typeof parsed.pageNumber !== "number" || !Array.isArray(parsed.lines)) {
    throw new Error(`No valid page object in response for page ${page.pageNumber}`);
  }
  const validIndices = new Set(inputLines.map((l) => l.lineIndex));
  const resultLines = (parsed.lines ?? [])
    .filter((l) => validIndices.has(l.lineIndex) && typeof l.translated === "string")
    .map((l) => ({ lineIndex: l.lineIndex, translated: l.translated }));

  // ── Translation Memory: persist source → translation pair for this page ────
  // Scoped to uploadId so memories from different comics don't cross-contaminate.
  // Mem0 handles ADD vs UPDATE internally, so re-translating the same page
  // will update the existing memory entry rather than create a duplicate.
  if (uploadId) {
    const srcText = page.lines.map((l) => l.text.trim()).filter(Boolean).join(" | ").slice(0, memoryTmMaxChars);
    const trlText = resultLines.map((l) => l.translated).join(" | ").slice(0, memoryTmMaxChars);
    if (srcText && trlText) {
      void runMemoryCli([
        "add",
        "--content",
        `[Page ${page.pageNumber}] ${targetLanguage} translation: ${srcText} → ${trlText}`,
        "--user-id", uploadId,
      ]);
    }
  }

  return {
    pageNumber: parsed.pageNumber ?? page.pageNumber,
    lines: resultLines,
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
