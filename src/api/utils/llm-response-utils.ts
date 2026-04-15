import { getLogger } from "../../logger.ts";

const logger = getLogger("llm-response");

/**
 * Strip <think>…</think> blocks, markdown fences, and carriage returns
 * from raw LLM output before JSON extraction.
 */
export const cleanRawResponse = (raw: string): string => {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1");
  return s.replace(/\r/g, "").trim();
};

/**
 * Fix bare control characters (literal newlines/tabs) inside JSON string
 * values that would otherwise cause JSON.parse to throw.
 */
export const sanitizeJsonControlChars = (fragment: string): string => {
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

/**
 * Extract the first complete `{...}` JSON object from a string,
 * tolerating surrounding text from LLM output.
 */
export const extractFirstObject = (raw: string): unknown => {
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
          try { return JSON.parse(fragment); } catch { /* try sanitized */ }
          try { return JSON.parse(sanitizeJsonControlChars(fragment)); } catch { /* try next */ }
          i++; break;
        }
      }
      i++;
    }
  }
  const preview = cleaned.slice(0, 300).replace(/\n/g, "\\n");
  logger.warn(`extractFirstObject: no valid JSON found. Preview: ${preview}`);
  return null;
};

/**
 * Extract the first complete JSON object or array from a string.
 */
export const extractFirstJson = (raw: string): unknown => {
  const cleaned = cleanRawResponse(raw);
  const openChars = new Set(["{", "["]);
  const closeMap: Record<string, string> = { "{": "}", "[": "]" };
  let i = 0;
  while (i < cleaned.length) {
    while (i < cleaned.length && !openChars.has(cleaned[i])) i++;
    if (i >= cleaned.length) break;
    const opener = cleaned[i];
    const closer = closeMap[opener];
    let depth = 0, inStr = false, esc = false;
    const start = i;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (esc) { esc = false; i++; continue; }
      if (ch === "\\" && inStr) { esc = true; i++; continue; }
      if (ch === '"') { inStr = !inStr; i++; continue; }
      if (inStr) { i++; continue; }
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) {
          const fragment = cleaned.slice(start, i + 1);
          try { return JSON.parse(fragment); } catch { /* try sanitized */ }
          try { return JSON.parse(sanitizeJsonControlChars(fragment)); } catch { /* try next */ }
          i++; break;
        }
      }
      i++;
    }
  }
  const preview = cleaned.slice(0, 300).replace(/\n/g, "\\n");
  logger.warn(`extractFirstJson: no valid JSON found. Preview: ${preview}`);
  return null;
};

/**
 * Estimate prompt token count (chars / 3 for CJK-heavy text, conservative)
 * and round up to the next power of 2, clamped to [4096, 131072].
 * Keeps KV-cache allocation proportional to actual content.
 */
export const computeNumCtx = (systemPrompt: string, userMessage: string): number => {
  const estimated = Math.ceil((systemPrompt.length + userMessage.length) / 3);
  let ctx = 4096;
  while (ctx < estimated * 2) ctx *= 2;
  return Math.min(Math.max(ctx, 4096), 131072);
};
