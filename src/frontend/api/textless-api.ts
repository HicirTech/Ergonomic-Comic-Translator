import type { OcrJobStatus } from "./types.ts";

export const enqueueTextless = async (uploadId: string): Promise<void> => {
  const res = await fetch(`/api/textless/${uploadId}`, { method: "POST" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Textless enqueue failed");
  }
};

export const enqueueTextlessPage = async (uploadId: string, page: number): Promise<void> => {
  const res = await fetch(`/api/textless/${uploadId}/${page}`, { method: "POST" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Textless page enqueue failed");
  }
};

export interface TextlessJobStatusResult {
  status: OcrJobStatus;
  pagesCompleted: number | null;
  pagesDone: number | null;
  pagesTotal: number | null;
  pageStatuses: Array<{ pageNumber: number; status: "pending" | "completed" | "failed" }>;
  lastError: string | null;
}

export const fetchTextlessJobStatus = async (uploadId: string): Promise<TextlessJobStatusResult> => {
  const res = await fetch(`/api/textless/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch textless job status");
  const data = (await res.json()) as {
    record?: {
      status: OcrJobStatus;
      pages?: Array<{ pageNumber: number; status: "pending" | "completed" | "failed" }>;
    } | null;
    status?: OcrJobStatus;
  };

  const recordPages = data.record?.pages ?? [];
  const pagesCompleted = recordPages.filter((p) => p.status === "completed").length;
  const pagesDone = recordPages.filter((p) => p.status === "completed" || p.status === "failed").length;

  return {
    status: data.record?.status ?? data.status ?? "Ready",
    pagesCompleted: recordPages.length > 0 ? pagesCompleted : null,
    pagesDone: recordPages.length > 0 ? pagesDone : null,
    pagesTotal: recordPages.length > 0 ? recordPages.length : null,
    pageStatuses: recordPages.map((p) => ({ pageNumber: p.pageNumber, status: p.status })),
    lastError: (data.record as Record<string, unknown> | undefined)?.lastError as string | null ?? null,
  };
};
