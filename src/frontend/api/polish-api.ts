import type { OcrJobStatus } from "./types.ts";

export const enqueuePolish = async (
  uploadId: string,
  opts: { targetLanguage?: string; model?: string } = {},
): Promise<void> => {
  const res = await fetch(`/api/polish/${uploadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Polish enqueue failed");
  }
};

export interface PolishJobStatusResult {
  status: OcrJobStatus;
  pagesCompleted: number | null;
  pagesDone: number | null;
  pagesTotal: number | null;
  pageStatuses: Array<{ pageNumber: number; status: "pending" | "completed" | "failed" }>;
}

export const fetchPolishJobStatus = async (
  uploadId: string,
): Promise<PolishJobStatusResult> => {
  const res = await fetch(`/api/polish/${uploadId}`);
  if (!res.ok) throw new Error("Failed to fetch polish job status");
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
