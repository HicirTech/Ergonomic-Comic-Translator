import type { OcrLineItem } from "../api/index.ts";

export const OCR_LINE_WARNING_THRESHOLD = 100;
export const OCR_LINE_SHORT_THRESHOLD = 5;
export const OCR_LINE_CRITICAL_SHORT_THRESHOLD = 1;

export type OcrLineStatus = "normal" | "long" | "short" | "critical-short";

export interface OcrLineSummary {
  lineIndex: number;
  text: string;
  charCount: number;
  hasWarning: boolean;
  hasShortWarning: boolean;
  hasCriticalShortWarning: boolean;
  status: OcrLineStatus;
}

export const buildOcrSummarySignature = (summaries: OcrLineSummary[]): string =>
  summaries.map((summary) => `${summary.lineIndex}:${summary.charCount}:${summary.status}`).join("|");

export const sameOcrSummaries = (a: OcrLineSummary[], b: OcrLineSummary[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].lineIndex !== b[i].lineIndex ||
      a[i].charCount !== b[i].charCount ||
      a[i].status !== b[i].status
    ) {
      return false;
    }
  }
  return true;
};

export const countOcrLineChars = (text: string): number => text.replace(/\s+/g, "").length;

export const summarizeOcrLines = (lines: OcrLineItem[] | null | undefined): OcrLineSummary[] =>
  (lines ?? []).map((line) => {
    const charCount = countOcrLineChars(line.text ?? "");
    const hasWarning = charCount > OCR_LINE_WARNING_THRESHOLD;
    const hasCriticalShortWarning = charCount <= OCR_LINE_CRITICAL_SHORT_THRESHOLD;
    const hasShortWarning = !hasCriticalShortWarning && charCount < OCR_LINE_SHORT_THRESHOLD;
    return {
      lineIndex: line.lineIndex,
      text: line.text ?? "",
      charCount,
      hasWarning,
      hasShortWarning,
      hasCriticalShortWarning,
      status: hasWarning ? "long" : hasCriticalShortWarning ? "critical-short" : hasShortWarning ? "short" : "normal",
    };
  });