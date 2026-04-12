import type { OcrJobStatus, OcrLineItem, OcrPageLines } from "./types.ts";

// ── Config ────────────────────────────────────────────────────────────────────

export interface OcrConfig {
  currentModel: string;
  currentLanguage: string;
  supportedModels: string[];
}

export const fetchOcrConfig = async (): Promise<OcrConfig> => {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to fetch config");
  const data = (await res.json()) as {
    ocr: {
      current: { model: string; language: string };
      configurableOptions: { model: string[] };
    };
  };
  return {
    currentModel: data.ocr.current.model,
    currentLanguage: data.ocr.current.language,
    supportedModels: data.ocr.configurableOptions.model,
  };
};

// ── Job queue ─────────────────────────────────────────────────────────────────

export const enqueueOcr = async (
  uploadId: string,
  opts: { model?: string; force?: boolean; language?: string } = {},
): Promise<void> => {
  const url = `/api/ocr/${uploadId}${opts.force ? "?force=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model, language: opts.language }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "OCR enqueue failed");
  }
};

export const enqueueOcrPage = async (
  uploadId: string,
  page: number,
  model?: string,
  language?: string,
): Promise<void> => {
  const res = await fetch(`/api/ocr/${uploadId}/${page}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, language }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "OCR page enqueue failed");
  }
};

// ── Job status ────────────────────────────────────────────────────────────────

export interface OcrJobStatusResult {
  status: OcrJobStatus;
  pagesCompleted: number | null;
  pagesTotal: number | null;
  lastError: string | null;
}

export const fetchOcrJobStatus = async (uploadId: string): Promise<OcrJobStatusResult> => {
  const res = await fetch(`/api/ocr/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch OCR job status");
  const data = (await res.json()) as {
    record?: { status: OcrJobStatus; pagesCompleted?: number | null; pagesTotal?: number | null };
    status?: OcrJobStatus;
  };
  const status = data.record?.status ?? data.status ?? "Ready";
  return {
    status,
    pagesCompleted: data.record?.pagesCompleted ?? null,
    pagesTotal: data.record?.pagesTotal ?? null,
    lastError: (data.record as Record<string, unknown> | undefined)?.lastError as string | null ?? null,
  };
};

// ── Page lines ────────────────────────────────────────────────────────────────

const fetchOcrOutputPages = async (uploadId: string): Promise<OcrPageLines[]> => {
  const res = await fetch(`/api/ocr/${uploadId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    record?: { status: OcrJobStatus };
    output?: { pages?: OcrPageLines[] };
  };
  if (data.record?.status !== "Completed" || !data.output?.pages) return [];
  return data.output.pages;
};

export const fetchOcrPageLines = async (
  uploadId: string,
  pageNumber: number,
): Promise<OcrLineItem[] | null> => {
  const res = await fetch(`/api/ocr/${uploadId}/${pageNumber}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { lines?: OcrLineItem[] };
  return Array.isArray(data.lines) ? data.lines : null;
};

export const fetchAllOcrPageLines = async (uploadId: string): Promise<OcrPageLines[]> =>
  fetchOcrOutputPages(uploadId);

export const saveOcrPageLines = async (
  uploadId: string,
  pageNumber: number,
  lines: OcrLineItem[],
): Promise<void> => {
  const res = await fetch(`/api/ocr/${uploadId}/${pageNumber}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to save OCR edits");
  }
};
