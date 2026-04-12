import type { OcrJobStatus, TranslatedLine, TranslationPageLines } from "./types.ts";

export const fetchTranslationPage = async (
  uploadId: string,
  pageNumber: number,
): Promise<TranslatedLine[]> => {
  const res = await fetch(`/api/translate/${uploadId}/${pageNumber}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { lines?: TranslatedLine[] };
  return data.lines ?? [];
};

export const fetchAllTranslationPages = async (uploadId: string): Promise<TranslationPageLines[]> => {
  const res = await fetch(`/api/translate/${uploadId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    output?: Array<{ pageNumber: number; lines?: TranslatedLine[] }> | null;
  };
  if (!Array.isArray(data.output)) return [];
  return data.output.map((p) => ({ pageNumber: p.pageNumber, lines: p.lines ?? [] }));
};

export const saveTranslationPage = async (
  uploadId: string,
  pageNumber: number,
  lines: TranslatedLine[],
): Promise<void> => {
  const res = await fetch(`/api/translate/${uploadId}/${pageNumber}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to save translation edits");
  }
};

export const enqueueTranslation = async (
  uploadId: string,
  opts: { targetLanguage?: string; model?: string } = {},
): Promise<void> => {
  const res = await fetch(`/api/translate/${uploadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Translation enqueue failed");
  }
};

export const enqueueTranslationPage = async (
  uploadId: string,
  page: number,
  opts: { targetLanguage?: string; model?: string } = {},
): Promise<void> => {
  const res = await fetch(`/api/translate/${uploadId}/${page}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Translation page enqueue failed");
  }
};

export interface TranslationJobStatusResult {
  status: OcrJobStatus;
  pagesCompleted: number | null;
  pagesDone: number | null;
  pagesTotal: number | null;
  pageStatuses: Array<{ pageNumber: number; status: "pending" | "completed" | "failed" }>;
}

export const fetchTranslationJobStatus = async (
  uploadId: string,
): Promise<TranslationJobStatusResult> => {
  const res = await fetch(`/api/translate/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch translation job status");
  const data = (await res.json()) as {
    record?: {
      status: OcrJobStatus;
      pages?: Array<{ pageNumber: number; status: "pending" | "completed" | "failed" }>;
    } | null;
  };
  const recordPages = data.record?.pages ?? [];
  const pagesCompleted = recordPages.filter((p) => p.status === "completed").length;
  const pagesDone = recordPages.filter((p) => p.status === "completed" || p.status === "failed").length;
  return {
    status: data.record?.status ?? "Ready",
    pagesCompleted: recordPages.length > 0 ? pagesCompleted : null,
    pagesDone: recordPages.length > 0 ? pagesDone : null,
    pagesTotal: recordPages.length > 0 ? recordPages.length : null,
    pageStatuses: recordPages.map((p) => ({ pageNumber: p.pageNumber, status: p.status })),
  };
};
