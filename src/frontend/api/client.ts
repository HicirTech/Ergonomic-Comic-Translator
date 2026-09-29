// Response types are the server's own; the files they come from import only plain type files, so the
// web UI type-checks without Bun types.
import type { ImportResult } from "../../server/interfaces/import-result.ts";
import type { ResourceStatus } from "../../server/interfaces/resource-status.ts";
import type { VolumeDetail } from "../../server/interfaces/volume-detail.ts";
import type { VolumeSummary } from "../../server/interfaces/volume-summary.ts";

/** Every write carries this header; the server refuses writes without it (cross-site protection). */
const clientHeaders = { "x-comic-translator": "1" };

/** A refusal from the server, with its Chinese explanation. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly messageZh: string) {
    super(messageZh);
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const write = init.method !== undefined && init.method !== "GET";
  const response = await fetch(path, write ? { ...init, headers: { ...clientHeaders, ...init.headers } } : init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { errorZh?: string } | null;
    throw new ApiError(response.status, body?.errorZh ?? `HTTP ${response.status}`);
  }
  return (response.status === 204 || response.headers.get("content-length") === "0" ? undefined : await response.json()) as T;
};

export const fetchStatus = () => request<{ resources: ResourceStatus; missing: { models: string[]; runtimes: string[] } }>("/api/status");

export const fetchVolumes = () => request<VolumeSummary[]>("/api/volumes");

export const fetchVolume = (id: string) => request<VolumeDetail>(`/api/volumes/${id}`);

/** Uploads dropped files; `path` keeps a file's folder inside a dropped folder so pages sort by chapter. */
export const uploadVolume = (files: readonly { file: File; path: string }[], title?: string) => {
  const form = new FormData();
  for (const { file, path } of files) form.append("files", file, path);
  if (title) form.append("title", title);
  return request<ImportResult>("/api/volumes", { method: "POST", body: form });
};

export const startVolume = (id: string) => request<{ jobId: string }>(`/api/volumes/${id}/start`, { method: "POST" });

export const cancelVolume = (id: string) => request<void>(`/api/volumes/${id}/cancel`, { method: "POST" });

export const deleteVolume = (id: string) => request<void>(`/api/volumes/${id}`, { method: "DELETE" });

export const pageImageUrl = (id: string, ordinal: number, variant: "original" | "translated", version = 0) =>
  `/api/volumes/${id}/pages/${ordinal}/${variant}${variant === "translated" ? `?v=${version}` : ""}`;

export const exportUrl = (id: string, format: "cbz" | "pdf") => `/api/volumes/${id}/export/${format}`;
