import type {
  PolishJobRecord,
  PolishPageRecord,
  PolishQueueStatusResponse,
  TranslationOutput,
} from "../interfaces";
import type { PolishJobRepository } from "../repositories";
import { nowIso } from "../utils";
import {
  loadOcrOutputForTranslate,
  loadTranslationOutput,
  resolveTranslatedOutputFile,
  saveTranslationOutput,
} from "./translate-processing.ts";
import { polishAll } from "./polish-processing.ts";
import { getLogger } from "../../logger.ts";
import { createQueueProcessor } from "./base-queue-processor.ts";

type QueueEntry = {
  uploadId: string;
  targetLanguage: string;
  model?: string;
};

const buildPolishRecord = (
  uploadId: string,
  allPageNumbers: number[],
  targetLanguage: string,
): PolishJobRecord => {
  const now = nowIso();
  return {
    uploadId,
    status: "Ready",
    targetLanguage,
    outputFile: resolveTranslatedOutputFile(uploadId),
    pages: allPageNumbers.map((n) => ({ pageNumber: n, status: "pending", lastError: null })),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    lastError: null,
  };
};

export const createPolishQueueService = (polishJobRepository: PolishJobRepository) => {
  const queue = createQueueProcessor<QueueEntry>({
    recoverPersistedJobs: async (push, kick) => {
      const records = await polishJobRepository.list();
      const toRecover = records.filter((r) => r.status === "Processing" || r.status === "Queued");
      if (toRecover.length === 0) return;

      const recoveredRecords = toRecover.map((record) => ({
        ...record,
        status: "Queued" as const,
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        lastError: record.status === "Processing"
          ? record.lastError ?? "Server restarted before polishing completed. The job was re-queued."
          : record.lastError,
      }));

      await polishJobRepository.upsertMany(recoveredRecords);

      for (const record of recoveredRecords.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (!queue.pendingEntries.some((e) => e.uploadId === record.uploadId)) {
          push({ uploadId: record.uploadId, targetLanguage: record.targetLanguage });
        }
      }

      if (queue.pendingEntries.length > 0) kick();
    },

    processEntry: async ({ uploadId, targetLanguage, model }) => {
      const ocrOutput = loadOcrOutputForTranslate(uploadId);
      if (!ocrOutput) {
        throw new Error(`OCR output not found for scope "${uploadId}".`);
      }

      const translationOutput = loadTranslationOutput(uploadId);
      if (!translationOutput || translationOutput.length === 0) {
        throw new Error(`No translation output found for scope "${uploadId}". Run translation first.`);
      }

      const records = await polishJobRepository.list();
      const allPageNumbers = translationOutput.map((p) => p.pageNumber);
      const existingRecord = records.find((r) => r.uploadId === uploadId)
        ?? buildPolishRecord(uploadId, allPageNumbers, targetLanguage);

      const processingRecord: PolishJobRecord = {
        ...existingRecord,
        status: "Processing",
        targetLanguage,
        updatedAt: nowIso(),
        startedAt: existingRecord.startedAt ?? nowIso(),
        completedAt: null,
        lastError: null,
      };
      await polishJobRepository.upsert(processingRecord);

      const logger = getLogger("polish");
      logger.info(`Starting polish for "${uploadId}": ${translationOutput.length} page(s) → ${targetLanguage}`);

      const startedAt = Date.now();
      const pageRecordMap = new Map(existingRecord.pages.map((p) => [p.pageNumber, p]));

      const polished = await polishAll(
        ocrOutput,
        translationOutput,
        targetLanguage,
        async (chunkPages) => {
          for (const page of chunkPages) {
            pageRecordMap.set(page.pageNumber, { pageNumber: page.pageNumber, status: "completed", lastError: null });
          }
          await polishJobRepository.upsert({
            ...processingRecord,
            pages: [...pageRecordMap.values()],
            updatedAt: nowIso(),
          });
        },
        model,
        uploadId,
      );

      // Save polished translations (overwrites translated.json)
      const outputFile = saveTranslationOutput(uploadId, polished);

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      logger.info(`Polish complete: ${polished.length} page(s) in ${elapsed}s`);
      logger.info(`Output: ${outputFile}`);

      const finalPageRecords: PolishPageRecord[] = [...pageRecordMap.values()];

      await polishJobRepository.upsert({
        ...processingRecord,
        status: "Completed",
        outputFile,
        pages: finalPageRecords,
        updatedAt: nowIso(),
        completedAt: nowIso(),
      });
    },

    onEntryError: async (entry, error) => {
      const records = await polishJobRepository.list();
      const existing = records.find((r) => r.uploadId === entry.uploadId);
      if (existing) {
        await polishJobRepository.upsert({
          ...existing,
          status: "Ready",
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  void queue.initialize();

  const getQueueStatus = async (): Promise<PolishQueueStatusResponse> => {
    await queue.initialize();
    const records = await polishJobRepository.list();
    return {
      activeUploadId: queue.getActiveUploadId(),
      queuedUploadIds: queue.pendingEntries.map((e) => e.uploadId),
      records: records.sort((a, b) => a.uploadId.localeCompare(b.uploadId)),
    };
  };

  const enqueue = async (
    uploadId: string,
    options: { targetLanguage?: string; model?: string } = {},
  ) => {
    await queue.initialize();

    const targetLanguage = options.targetLanguage?.trim() || "Chinese";

    const translationOutput = loadTranslationOutput(uploadId);
    if (!translationOutput || translationOutput.length === 0) {
      return {
        statusCode: 400,
        body: { error: `No translation output found for scope "${uploadId}". Run translation first.` },
      };
    }

    const ocrOutput = loadOcrOutputForTranslate(uploadId);
    if (!ocrOutput || ocrOutput.pages.length === 0) {
      return {
        statusCode: 400,
        body: { error: `No OCR output found for scope "${uploadId}". Run OCR first.` },
      };
    }

    if (queue.getActiveUploadId() === uploadId) {
      const existing = (await polishJobRepository.list()).find((r) => r.uploadId === uploadId);
      return {
        statusCode: 202,
        body: {
          message: `Upload "${uploadId}" is currently being polished.`,
          record: existing ?? buildPolishRecord(uploadId, translationOutput.map((p) => p.pageNumber), targetLanguage),
        },
      };
    }

    if (queue.pendingEntries.find((e) => e.uploadId === uploadId)) {
      const record = (await polishJobRepository.list()).find((r) => r.uploadId === uploadId);
      return {
        statusCode: 202,
        body: { message: `Upload "${uploadId}" is already queued for polishing.`, record },
      };
    }

    const allPageNumbers = translationOutput.map((p) => p.pageNumber);
    const now = nowIso();
    const existingRecord = (await polishJobRepository.list()).find((r) => r.uploadId === uploadId);

    const queuedRecord: PolishJobRecord = {
      uploadId,
      status: queue.getActiveUploadId() === null && queue.pendingEntries.length === 0 ? "Processing" : "Queued",
      targetLanguage,
      outputFile: resolveTranslatedOutputFile(uploadId),
      pages: allPageNumbers.map((n) => ({ pageNumber: n, status: "pending" as const, lastError: null })),
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      lastError: null,
    };
    await polishJobRepository.upsert(queuedRecord);

    queue.pendingEntries.push({ uploadId, targetLanguage, model: options.model });
    queue.kickProcessor();

    return {
      statusCode: 202,
      body: {
        message: queuedRecord.status === "Processing"
          ? `Upload "${uploadId}" was queued for polishing and started immediately.`
          : `Upload "${uploadId}" was added to the polish queue.`,
        record: queuedRecord,
      },
    };
  };

  const getJob = async (uploadId: string) => {
    await queue.initialize();

    const record = (await polishJobRepository.list()).find((r) => r.uploadId === uploadId);
    if (!record) {
      return {
        statusCode: 400,
        body: { error: `No polish job found for scope "${uploadId}". POST /api/polish/${uploadId} first.` },
      };
    }

    if (record.status === "Processing" || record.status === "Queued") {
      return {
        statusCode: 202,
        body: { message: `Polishing for "${uploadId}" is ${record.status.toLowerCase()}.`, record },
      };
    }

    return { statusCode: 200, body: { record } };
  };

  return { initialize: queue.initialize, getQueueStatus, enqueue, getJob };
};

export type PolishQueueService = ReturnType<typeof createPolishQueueService>;
