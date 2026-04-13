import type { ContextJobRecord, ContextQueueStatusResponse } from "../interfaces";
import type { ContextJobRepository } from "../repositories/context-job-repository.ts";
import { nowIso } from "../utils";
import { detectContextTerms, loadContextTerms, saveContextTerms, syncTermsToMemory } from "./context-processing.ts";
import { getLogger } from "../../logger.ts";
import { createQueueProcessor } from "./base-queue-processor.ts";
import type { ContextTerm } from "../interfaces/context-job-record.ts";

export type ContextQueueService = ReturnType<typeof createContextQueueService>;

type QueueEntry = {
  uploadId: string;
  pageNumbers: number[] | null;
  model?: string;
  targetLanguage?: string;
};

export const createContextQueueService = (contextJobRepository: ContextJobRepository) => {
  /** In-memory progress for the currently-running context job. Keyed by uploadId. */
  const activeProgress = new Map<string, { chunksCompleted: number; chunksTotal: number }>();

  const queue = createQueueProcessor<QueueEntry>({
    recoverPersistedJobs: async (push, kick) => {
      const records = await contextJobRepository.list();
      const toRecover = records.filter((r) => r.status === "Processing" || r.status === "Queued");
      if (toRecover.length === 0) return;

      const recoveredRecords = toRecover.map((record) => ({
        ...record,
        status: "Queued" as const,
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        chunksCompleted: null,
        chunksTotal: null,
        lastError: record.status === "Processing"
          ? record.lastError ?? "Server restarted before context detection completed."
          : record.lastError,
      }));

      await contextJobRepository.upsertMany(recoveredRecords);

      for (const record of recoveredRecords.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (!queue.pendingEntries.some((e) => e.uploadId === record.uploadId)) {
          push({ uploadId: record.uploadId, pageNumbers: record.pageNumbers });
        }
      }

      if (queue.pendingEntries.length > 0) kick();
    },

    processEntry: async ({ uploadId, pageNumbers, model, targetLanguage }) => {
      const logger = getLogger("context");

      const records = await contextJobRepository.list();
      const existingRecord = records.find((r) => r.uploadId === uploadId);
      const now = nowIso();
      const processingRecord: ContextJobRecord = existingRecord
        ? { ...existingRecord, status: "Processing", updatedAt: now, startedAt: existingRecord.startedAt ?? now, completedAt: null, lastError: null, chunksCompleted: null, chunksTotal: null }
        : { uploadId, status: "Processing", pageNumbers, createdAt: now, updatedAt: now, startedAt: now, completedAt: null, lastError: null, chunksCompleted: null, chunksTotal: null };

      await contextJobRepository.upsert(processingRecord);

      const onProgress = (chunksCompleted: number, chunksTotal: number) => {
        activeProgress.set(uploadId, { chunksCompleted, chunksTotal });
      };

      await detectContextTerms(uploadId, pageNumbers, model, targetLanguage, onProgress);
      activeProgress.delete(uploadId);
      logger.info(`Context detection completed for "${uploadId}"`);

      await contextJobRepository.upsert({
        ...processingRecord,
        status: "Completed",
        updatedAt: nowIso(),
        completedAt: nowIso(),
        chunksCompleted: null,
        chunksTotal: null,
      });
    },

    onEntryError: async (entry, error) => {
      activeProgress.delete(entry.uploadId);
      const records = await contextJobRepository.list();
      const existing = records.find((r) => r.uploadId === entry.uploadId);
      if (existing) {
        await contextJobRepository.upsert({
          ...existing,
          status: "Ready",
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null,
          chunksCompleted: null,
          chunksTotal: null,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  void queue.initialize();

  const getQueueStatus = async (): Promise<ContextQueueStatusResponse> => {
    await queue.initialize();
    const records = await contextJobRepository.list();
    return {
      activeUploadId: queue.getActiveUploadId(),
      queuedUploadIds: queue.pendingEntries.map((e) => e.uploadId),
      records: records.sort((a, b) => a.uploadId.localeCompare(b.uploadId)),
    };
  };

  const getJob = async (uploadId: string) => {
    await queue.initialize();
    const records = await contextJobRepository.list();
    const record = records.find((r) => r.uploadId === uploadId) ?? null;
    const terms = record ? loadContextTerms(uploadId) : [];
    const progress = activeProgress.get(uploadId);
    const mergedRecord = record && progress
      ? { ...record, chunksCompleted: progress.chunksCompleted, chunksTotal: progress.chunksTotal }
      : record;
    return {
      statusCode: 200,
      body: { record: mergedRecord, terms },
    };
  };

  const enqueue = async (
    uploadId: string,
    options: { pageNumber?: number; model?: string; targetLanguage?: string } = {},
  ) => {
    await queue.initialize();

    const pageNumbers = options.pageNumber !== undefined ? [options.pageNumber] : null;
    const now = nowIso();

    const records = await contextJobRepository.list();
    const record: ContextJobRecord = records.find((r) => r.uploadId === uploadId) ?? {
      uploadId,
      status: "Queued" as const,
      pageNumbers,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      lastError: null,
      chunksCompleted: null,
      chunksTotal: null,
    };

    await contextJobRepository.upsert({
      ...record,
      status: "Queued",
      pageNumbers,
      updatedAt: now,
      lastError: null,
      chunksCompleted: null,
      chunksTotal: null,
    });

    if (!queue.pendingEntries.some((e) => e.uploadId === uploadId)) {
      queue.pendingEntries.push({ uploadId, pageNumbers, model: options.model, targetLanguage: options.targetLanguage });
      queue.kickProcessor();
    }

    return {
      statusCode: 202,
      body: { message: `Context detection queued for "${uploadId}".` },
    };
  };

  /** Return current context terms for the upload (does not start a job). */
  const getTerms = (uploadId: string): { statusCode: number; body: unknown } => {
    const terms = loadContextTerms(uploadId);
    return { statusCode: 200, body: { terms } };
  };

  /**
   * Replace the full terms list for an upload.
   * Used by the frontend when the user edits/deletes terms.
   * Fire-and-forgets a memory sync so edited explanations are reflected
   * in future translation and context lookups for this upload.
   */
  const putTerms = (uploadId: string, terms: ContextTerm[]): { statusCode: number; body: unknown } => {
    saveContextTerms(uploadId, terms);
    syncTermsToMemory(uploadId, terms);
    return { statusCode: 200, body: { terms } };
  };

  return { getQueueStatus, getJob, enqueue, getTerms, putTerms };
};
