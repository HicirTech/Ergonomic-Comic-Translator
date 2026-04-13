import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { contextChunkPages, contextRootDir, memorySearchConcurrency, ollamaHost, ollamaTranslateModel } from "../../config.ts";
import { resolveOutputFileForScope } from "../../ocr/runtime-context.ts";
import type { OcrOutput, OcrPage } from "../../ocr/interfaces";
import { getLogger } from "../../logger.ts";
import type { ContextTerm } from "../interfaces/context-job-record.ts";
import { runMemoryCli } from "../../scripts/python-run.ts";

export const resolveContextDir = (uploadId: string) =>
  resolve(contextRootDir, uploadId);

export const resolveContextFile = (uploadId: string) =>
  resolve(resolveContextDir(uploadId), "context.json");

// ── Persistence ───────────────────────────────────────────────────────────────

export const loadContextTerms = (uploadId: string): ContextTerm[] => {
  const file = resolveContextFile(uploadId);
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, "utf8");
    return JSON.parse(raw) as ContextTerm[];
  } catch {
    return [];
  }
};

export const saveContextTerms = (uploadId: string, terms: ContextTerm[]): void => {
  const dir = resolveContextDir(uploadId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolveContextFile(uploadId), JSON.stringify(terms, null, 2), "utf8");
};

export const loadOcrOutputForContext = (scope: string): OcrOutput | null => {
  const file = resolveOutputFileForScope(scope);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as OcrOutput;
};

// ── Response sanitisation (shared with translate-processing) ──────────────────

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

const extractFirstObject = (raw: string): Record<string, unknown> | null => {
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
          try {
            const parsed = JSON.parse(fragment) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
          } catch { /* try sanitized */ }
          try {
            const parsed = JSON.parse(sanitizeJsonControlChars(fragment)) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
          } catch { /* try next */ }
          i++; break;
        }
      }
      i++;
    }
  }
  return null;
};

const extractFirstArray = (raw: string): unknown[] | null => {
  const cleaned = cleanRawResponse(raw);
  let i = 0;
  while (i < cleaned.length) {
    while (i < cleaned.length && cleaned[i] !== "[") i++;
    if (i >= cleaned.length) break;
    let depth = 0, inStr = false, esc = false;
    const start = i;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (esc) { esc = false; i++; continue; }
      if (ch === "\\" && inStr) { esc = true; i++; continue; }
      if (ch === '"') { inStr = !inStr; i++; continue; }
      if (inStr) { i++; continue; }
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          const fragment = cleaned.slice(start, i + 1);
          try { return JSON.parse(fragment) as unknown[]; } catch { /* try sanitized */ }
          try { return JSON.parse(sanitizeJsonControlChars(fragment)) as unknown[]; } catch { /* try next */ }
          i++; break;
        }
      }
      i++;
    }
  }
  return null;
};

// ── AI call ───────────────────────────────────────────────────────────────────

const TERMS_EXPLAIN_BATCH_SIZE = 10;
const MAX_OCR_CONTEXT_CHARS = 8000;

/** Minimum semantic similarity score (0–1) for a memory hit to be used as a term pre-fill. */
const MEMORY_HIT_MIN_SCORE = 0.85;

/**
 * Estimate prompt token count and round up to the next power of 2, clamped to [4096, 131072].
 * Same heuristic as translate-processing.ts.
 */
const computeNumCtx = (systemPrompt: string, userMessage: string): number => {
  const estimated = Math.ceil((systemPrompt.length + userMessage.length) / 3);
  let ctx = 4096;
  while (ctx < estimated * 2) ctx *= 2;
  return Math.min(Math.max(ctx, 4096), 131072);
};

const buildContextSystemPrompt = (): string =>
  `You are an expert manga/comic analyst. Your task is to identify proper nouns, technical terms, and domain-specific vocabulary in the provided OCR text that a translator might find ambiguous or untranslatable without additional context.

Focus on:
- Character names, place names, organization names
- Unique titles, honorifics, nicknames
- Story-specific jargon, special abilities, item names
- Historical or cultural references specific to the work

Output ONLY a JSON array of strings, each being one term. No explanation, no markdown.

EXAMPLE OUTPUT:
["竜王丸", "魔剣スラッシャー", "禁忌の術式", "転生の儀"]

Rules:
- Only include terms that are genuinely ambiguous or require context for accurate translation.
- Do NOT include common everyday vocabulary.
- Do NOT include terms that are already obvious in any major language.
- Return an empty array [] if no such terms are found.`;

const buildExplainSystemPrompt = (targetLanguage: string): string =>
  `You are a manga/comic translation glossary assistant helping translators work into ${targetLanguage}.

For each term, provide the natural ${targetLanguage} equivalent that a native ${targetLanguage} speaker would use — prioritising culturally natural translation over literal explanation. Follow this priority order:
1. If the term has a well-known, natural equivalent in ${targetLanguage} (including transliterations, localised names, or cultural equivalents), give that equivalent directly (e.g. イイ子 → 好孩子).
2. If the term is a proper noun (character name, place, organisation) with no established translation, provide a suggested romanisation or transliteration into ${targetLanguage} script plus a brief note.
3. Only if no natural equivalent exists, give a short explanatory gloss in ${targetLanguage}.

CRITICAL RULE: Every value MUST be written entirely in ${targetLanguage}. Do NOT use English or any other language under any circumstances.

Use the OCR text provided as context to understand the story, characters, and setting.

Return ONLY a valid JSON object where each key is an input term and each value is the ${targetLanguage} equivalent or gloss. No markdown, no extra text, no other keys.

JSON format:
{"<term>": "<${targetLanguage} equivalent or gloss>", ...}`;

const callOllamaForTermExplanations = async (
  terms: string[],
  ocrText: string,
  targetLanguage: string,
  model?: string,
): Promise<Record<string, string>> => {
  const logger = getLogger("context");
  if (terms.length === 0) return {};

  const systemPrompt = buildExplainSystemPrompt(targetLanguage);
  const contextSnippet = ocrText.slice(0, MAX_OCR_CONTEXT_CHARS);
  const userMessage = `OCR context text:\n${contextSnippet}\n\nTerms to translate/localise:\n${JSON.stringify(terms)}\n\nFor each term, provide the natural ${targetLanguage} equivalent or gloss. All values must be in ${targetLanguage} ONLY.`;

  const response = await fetch(`${ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(3 * 60 * 1000),
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
        temperature: 0.2,
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

  const parsed = extractFirstObject(rawContent);
  if (!parsed) {
    logger.warn("term explanation: no JSON object in response, skipping explanations");
    return {};
  }

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && v.trim()) result[k] = v.trim();
  }
  return result;
};

const callOllamaForContext = async (  pages: OcrPage[],
  model?: string,
): Promise<string[]> => {
  const logger = getLogger("context");

  const ocrText = pages
    .flatMap((p) => p.lines.map((l) => l.text.trim()))
    .filter(Boolean)
    .join("\n");

  if (!ocrText.trim()) return [];

  const systemPrompt = buildContextSystemPrompt();
  const userMessage = `Analyse the following OCR source text and return the JSON array of proper nouns / untranslatable terms:\n\n${ocrText}`;

  const response = await fetch(`${ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(3 * 60 * 1000),
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

  const parsed = extractFirstArray(rawContent);
  if (!parsed) {
    logger.warn("context detection: no JSON array in response, returning empty");
    return [];
  }

  return parsed
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((s) => s.trim());
};

// ── Main detection function ───────────────────────────────────────────────────

/**
 * Analyse OCR text for the given upload (or specific pages) and merge
 * newly detected terms into the persisted context.json.
 *
 * Existing terms (including user-provided context) are preserved;
 * only genuinely new terms are appended.
 */
export const detectContextTerms = async (
  uploadId: string,
  pageNumbers: number[] | null,
  model?: string,
  targetLanguage?: string,
  onProgress?: (chunksCompleted: number, chunksTotal: number) => void,
): Promise<ContextTerm[]> => {
  const logger = getLogger("context");
  const ocrOutput = loadOcrOutputForContext(uploadId);
  if (!ocrOutput || ocrOutput.pages.length === 0) {
    throw new Error(`OCR output not found for upload "${uploadId}". Run OCR first.`);
  }

  const pagesToScan = pageNumbers === null
    ? ocrOutput.pages
    : ocrOutput.pages.filter((p) => pageNumbers.includes(p.pageNumber));

  if (pagesToScan.length === 0) {
    throw new Error(`No matching pages found for upload "${uploadId}".`);
  }

  // Check if there's any text at all
  const hasText = pagesToScan.some((p) => p.lines.some((l) => l.text.trim()));
  if (!hasText) {
    logger.info(`context detection for "${uploadId}": no text found on the specified pages`);
    return loadContextTerms(uploadId);
  }

  // Chunk pages to avoid exceeding the model's context window.
  // contextChunkPages === -1 means send all pages in one call (legacy behaviour).
  const chunkSize = contextChunkPages === -1 ? pagesToScan.length : contextChunkPages;
  const chunks: OcrPage[][] = [];
  for (let i = 0; i < pagesToScan.length; i += chunkSize) {
    chunks.push(pagesToScan.slice(i, i + chunkSize));
  }

  logger.info(
    `context detection for "${uploadId}": ${pagesToScan.length} page(s) split into ${chunks.length} chunk(s) of up to ${chunkSize}, calling AI…`,
  );

  onProgress?.(0, chunks.length);

  const allDetected: string[] = [];
  for (const [chunkIdx, chunk] of chunks.entries()) {
    logger.info(`context detection for "${uploadId}": chunk ${chunkIdx + 1}/${chunks.length} (${chunk.length} page(s))…`);
    const terms = await callOllamaForContext(chunk, model);
    logger.info(`context detection for "${uploadId}": chunk ${chunkIdx + 1} detected ${terms.length} term(s)`);
    allDetected.push(...terms);
    onProgress?.(chunkIdx + 1, chunks.length);
  }

  const detected = [...new Set(allDetected)];
  logger.info(`context detection for "${uploadId}": total unique terms detected: ${detected.length}`);

  // Merge with existing — preserve context already entered by the user
  const existing = loadContextTerms(uploadId);
  const existingSet = new Set(existing.map((t) => t.term));
  const merged: ContextTerm[] = [...existing];
  const newTerms: string[] = [];
  for (const term of detected) {
    if (!existingSet.has(term)) {
      merged.push({ term, context: "" });
      existingSet.add(term);
      newTerms.push(term);
    }
  }

  // ── Explanation phase ──────────────────────────────────────────────────────
  if (targetLanguage && newTerms.length > 0) {
    const allOcrText = pagesToScan
      .flatMap((p) => p.lines.map((l) => l.text.trim()))
      .filter(Boolean)
      .join("\n");

    // ── Memory pre-fill: look up each new term in persistent memory ──────────
    // When MEMORY_ENABLED=true this may resolve terms already stored for this
    // uploadId scope, reducing the number of LLM explanation calls needed.
    // Lookups are run in parallel (up to memorySearchConcurrency at a time) to
    // avoid sequential process-spawn overhead for large term lists.
    const termsBelowMemory: string[] = [];
    const termMemoryMap: Record<string, string> = {};

    const searchOneTerm = async (term: string): Promise<void> => {
      const memResult = await runMemoryCli([
        "search",
        "--query", `translation of "${term}" in ${targetLanguage}`,
        "--limit", "1",
        "--user-id", uploadId,
      ]) as { results?: Array<{ memory?: string; score?: number }> } | null;
      const topHit = memResult?.results?.[0];
      // Only use high-confidence hits (score ≥ 0.85) to avoid false matches.
      if (topHit?.memory && (topHit.score ?? 0) >= MEMORY_HIT_MIN_SCORE) {
        termMemoryMap[term] = topHit.memory;
        logger.info(`context memory hit for "${term}": ${topHit.memory} (score=${topHit.score})`);
      } else {
        termsBelowMemory.push(term);
      }
    };

    for (let i = 0; i < newTerms.length; i += memorySearchConcurrency) {
      await Promise.all(newTerms.slice(i, i + memorySearchConcurrency).map(searchOneTerm));
    }

    const termsToExplain = termsBelowMemory;

    const termBatches: string[][] = [];
    for (let i = 0; i < termsToExplain.length; i += TERMS_EXPLAIN_BATCH_SIZE) {
      termBatches.push(termsToExplain.slice(i, i + TERMS_EXPLAIN_BATCH_SIZE));
    }

    const totalSteps = chunks.length + termBatches.length;
    onProgress?.(chunks.length, totalSteps);
    logger.info(`context explanation for "${uploadId}": ${termsToExplain.length} term(s) need LLM (${newTerms.length - termsToExplain.length} resolved from memory), ${termBatches.length} batch(es) (targetLanguage="${targetLanguage}")`);

    const explanationMap: Record<string, string> = { ...termMemoryMap };
    for (const [batchIdx, batch] of termBatches.entries()) {
      logger.info(`context explanation for "${uploadId}": batch ${batchIdx + 1}/${termBatches.length} (${batch.length} term(s))…`);
      const explanations = await callOllamaForTermExplanations(batch, allOcrText, targetLanguage, model);
      Object.assign(explanationMap, explanations);
      onProgress?.(chunks.length + batchIdx + 1, totalSteps);
    }

    // Apply explanations to newly merged terms (only where context is still empty)
    for (const entry of merged) {
      if (entry.context === "" && explanationMap[entry.term]) {
        entry.context = explanationMap[entry.term];
      }
    }

    // ── Memory store: persist new explanations for future uploads ────────────
    for (const term of termsToExplain) {
      const explanation = explanationMap[term];
      if (explanation) {
        // Fire-and-forget: memory storage must not block or fail the main flow.
        void runMemoryCli([
          "add",
          "--content",
          `In manga/comic context, the term "${term}" translates to "${explanation}" in ${targetLanguage}.`,
          "--user-id", uploadId,
        ]);
      }
    }
  }

  saveContextTerms(uploadId, merged);
  return merged;
};

// ── Memory sync helper (used by putTerms for user-edited terms) ───────────────

/**
 * Fire-and-forget: persist each term that has a non-empty explanation into
 * Qdrant memory, scoped to the given uploadId.
 *
 * @param targetLanguage When provided, includes the language in the stored
 *   content (e.g. "translates to X in Chinese") to match the format used by
 *   `detectContextTerms`, improving semantic retrieval consistency.
 *   When omitted (e.g. for language-agnostic saves), the language suffix is
 *   skipped and the entry is still stored but may score slightly lower on
 *   language-specific lookups.
 *
 * Safe to call on every putTerms save — Mem0 will ADD new entries or UPDATE
 * existing ones as appropriate; it never creates duplicates.
 */
export const syncTermsToMemory = (uploadId: string, terms: ContextTerm[], targetLanguage?: string): void => {
  for (const term of terms) {
    if (!term.context.trim()) continue;
    const content = targetLanguage
      ? `In manga/comic context, the term "${term.term}" translates to "${term.context}" in ${targetLanguage}.`
      : `In manga/comic context, the term "${term.term}" translates to "${term.context}".`;
    void runMemoryCli([
      "add",
      "--content",
      content,
      "--user-id", uploadId,
    ]);
  }
};
