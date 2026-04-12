import type { UploadBatch, UploadRecord } from "./types.ts";

// ── URL helpers ───────────────────────────────────────────────────────────────

export const getUploadCoverUrl = (uploadId: string) =>
  `/api/uploads/${uploadId}/cover`;

export const getUploadPageUrl = (uploadId: string, index: number): string =>
  `/api/uploads/${uploadId}/pages/${index}`;

export const getTextlessPageUrl = (uploadId: string, index: number): string =>
  `/api/uploads/${uploadId}/textless/pages/${index}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const groupAndSort = (
  records: UploadRecord[],
  pageCounts: Record<string, number>,
): UploadBatch[] => {
  const map = new Map<string, UploadRecord[]>();
  for (const r of records) {
    const bucket = map.get(r.uploadId) ?? [];
    bucket.push(r);
    map.set(r.uploadId, bucket);
  }
  return [...map.entries()]
    .map(([uploadId, recs]) => ({
      uploadId,
      records: recs,
      createdAt: recs.reduce(
        (min, r) => (r.createdAt < min ? r.createdAt : min),
        recs[0].createdAt,
      ),
      pageCount: pageCounts[uploadId],
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

// ── API functions ─────────────────────────────────────────────────────────────

export const fetchUploadBatches = async (): Promise<UploadBatch[]> => {
  const res = await fetch("/api/files");
  if (!res.ok) throw new Error("Failed to fetch uploads");
  const data = (await res.json()) as {
    records: UploadRecord[];
    pageCounts: Record<string, number>;
  };
  return groupAndSort(data.records, data.pageCounts ?? {});
};

export const uploadFiles = async (
  files: File[],
): Promise<{ uploadId: string }> => {
  const formData = new FormData();
  for (const file of files) formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Upload failed");
  }
  return res.json() as Promise<{ uploadId: string }>;
};

export const deleteUpload = async (uploadId: string): Promise<void> => {
  const res = await fetch(`/api/uploads/${uploadId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Delete failed");
  }
};

export const fetchUploadPages = async (uploadId: string): Promise<string[]> => {
  const res = await fetch(`/api/uploads/${uploadId}/pages`);
  if (!res.ok) throw new Error("Failed to fetch pages");
  const data = (await res.json()) as { pages: string[] };
  return data.pages;
};
