import type { OcrJobStatus, ContextTerm } from "./types.ts";

export interface ContextJobStatusResult {
  status: OcrJobStatus;
  chunksCompleted: number | null;
  chunksTotal: number | null;
}

export const fetchContextTerms = async (uploadId: string): Promise<ContextTerm[]> => {
  const res = await fetch(`/api/context/${uploadId}/terms`);
  if (!res.ok) return [];
  const data = (await res.json()) as { terms?: ContextTerm[] };
  return data.terms ?? [];
};

export const saveContextTerms = async (uploadId: string, terms: ContextTerm[]): Promise<void> => {
  const res = await fetch(`/api/context/${uploadId}/terms`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ terms }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to save context terms");
  }
};

export const enqueueContext = async (
  uploadId: string,
  options?: { page?: number; targetLanguage?: string; model?: string },
): Promise<void> => {
  const page = options?.page;
  const url = page !== undefined
    ? `/api/context/${uploadId}/${page}`
    : `/api/context/${uploadId}`;
  const body: Record<string, unknown> = {};
  if (options?.targetLanguage) body.targetLanguage = options.targetLanguage;
  if (options?.model) body.model = options.model;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Context enqueue failed");
  }
};

export const fetchContextJobStatus = async (uploadId: string): Promise<ContextJobStatusResult> => {
  const res = await fetch(`/api/context/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch context job status");
  const data = (await res.json()) as {
    record?: { status: OcrJobStatus; chunksCompleted?: number | null; chunksTotal?: number | null } | null;
  };
  return {
    status: data.record?.status ?? "Ready",
    chunksCompleted: data.record?.chunksCompleted ?? null,
    chunksTotal: data.record?.chunksTotal ?? null,
  };
};
