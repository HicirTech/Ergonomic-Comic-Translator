import type {
  TranslationJobRecord,
  TranslationOutput,
  TranslationPageRecord,
  TranslationQueueStatusResponse,
} from "../interfaces";
import type { TranslationJobRepository } from "../repositories";
import { nowIso } from "../utils";
import {
  loadOcrOutputForTranslate,
  loadTranslationOutput,
  resolveTranslatedOutputFile,
  saveTranslationOutput,
  translateAll,
} from "./translate-processing.ts";
import { getLogger } from "../../logger.ts";
import { createQueueProcessor } from "./base-queue-processor.ts";
type QueueEntry = {
  uploadId: string;
  pageNumbers: number[] | null; // null = all pages
  targetLanguage: string;
  model?: string;
};

const buildTranslationRecord = (
  uploadId: string,
  allPageNumbers: number[],
  targetLanguage: string,
): TranslationJobRecord => {
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

export const createTranslateQueueService = (translateJobRepository: TranslationJobRepository) => {
  const queue = createQueueProcessor<QueueEntry>({
    recoverPersistedJobs: async (push, kick) => {
      const records = await translateJobRepository.list();
      const toRecover = records.filter((r) => r.status === "Processing" || r.status === "Queued");
      if (toRecover.length === 0) return;

      const recoveredRecords = toRecover.map((record) => ({
        ...record,
        status: "Queued" as const,
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        lastError: record.status === "Processing"
          ? record.lastError ?? "Server restarted before translation completed. The job was re-queued."
          : record.lastError,
      }));

      await translateJobRepository.upsertMany(recoveredRecords);

      for (const record of recoveredRecords.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (!queue.pendingEntries.some((e) => e.uploadId === record.uploadId)) {
          push({ uploadId: record.uploadId, pageNumbers: null, targetLanguage: record.targetLanguage });
        }
      }

      if (queue.pendingEntries.length > 0) kick();
    },

    processEntry: async ({ uploadId, pageNumbers, targetLanguage, model }) => {
      const ocrOutput = loadOcrOutputForTranslate(uploadId);
      if (!ocrOutput) {
        throw new Error(`OCR output not found for scope "${uploadId}".`);
      }

      const records = await translateJobRepository.list();
      const allPageNumbers = ocrOutput.pages.map((p) => p.pageNumber);
      const existingRecord = records.find((r) => r.uploadId === uploadId)
        ?? buildTranslationRecord(uploadId, allPageNumbers, targetLanguage);

      const processingRecord: TranslationJobRecord = {
        ...existingRecord,
        status: "Processing",
        targetLanguage,
        updatedAt: nowIso(),
        startedAt: existingRecord.startedAt ?? nowIso(),
        completedAt: null,
        lastError: null,
      };
      await translateJobRepository.upsert(processingRecord);

      const totalLines = ocrOutput.pages.reduce((s, p) => s + p.lines.length, 0);
      const logger = getLogger("translate");
      logger.info(`Starting translation for "${uploadId}": ${ocrOutput.pages.length} page(s), ${totalLines} line(s) \u2192 ${targetLanguage}`);

      const startedAt = Date.now();
      const outputMap = new Map<number, TranslationOutput[number]>();
      const pageRecordMap = new Map(existingRecord.pages.map((p) => [p.pageNumber, p]));
      let successCount = 0;

      const pagesToTranslate = pageNumbers !== null
        ? ocrOutput.pages.filter((p) => pageNumbers.includes(p.pageNumber))
        : ocrOutput.pages;

      await translateAll(pagesToTranslate, targetLanguage, async (translated) => {
        outputMap.set(translated.pageNumber, translated);
        pageRecordMap.set(translated.pageNumber, { pageNumber: translated.pageNumber, status: "completed", lastError: null });
        successCount++;

        const existingOutput = loadTranslationOutput(uploadId) ?? [];
        const existingMap = new Map(existingOutput.map((p) => [p.pageNumber, p]));
        for (const [k, v] of outputMap) existingMap.set(k, v);
        const merged: TranslationOutput = ocrOutput.pages
          .map((p) => existingMap.get(p.pageNumber))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);
        saveTranslationOutput(uploadId, merged);

        await translateJobRepository.upsert({
          ...processingRecord,
          pages: [...pageRecordMap.values()],
          updatedAt: nowIso(),
        });
      }, model, uploadId);

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const outputFile = resolveTranslatedOutputFile(uploadId);
      logger.info(`Complete: ${successCount}/${ocrOutput.pages.length} page(s) in ${elapsed}s`);
      logger.info(`Output: ${outputFile}`);

      // Only persist pages that are tracked in this job — do not invent "pending" entries
      // for pages that were never part of this run.
      const finalPageRecords: TranslationPageRecord[] = [...pageRecordMap.values()];

      await translateJobRepository.upsert({
        ...processingRecord,
        status: "Completed",
        outputFile,
        pages: finalPageRecords,
        updatedAt: nowIso(),
        completedAt: nowIso(),
      });
    },

    onEntryError: async (entry, error) => {
      const records = await translateJobRepository.list();
      const existing = records.find((r) => r.uploadId === entry.uploadId);
      if (existing) {
        await translateJobRepository.upsert({
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

  const getQueueStatus = async (): Promise<TranslationQueueStatusResponse> => {
    await queue.initialize();
    const records = await translateJobRepository.list();
    return {
      activeUploadId: queue.getActiveUploadId(),
      queuedUploadIds: queue.pendingEntries.map((e) => e.uploadId),
      records: records.sort((a, b) => a.uploadId.localeCompare(b.uploadId)),
    };
  };

  const enqueue = async (
    uploadId: string,
    options: { pageNumber?: number; targetLanguage?: string; model?: string } = {},
  ) => {
    await queue.initialize();

    const targetLanguage = options.targetLanguage?.trim() || "Chinese";

    const ocrOutput = loadOcrOutputForTranslate(uploadId);
    if (!ocrOutput || ocrOutput.pages.length === 0) {
      return {
        statusCode: 400,
        body: { error: `No OCR output found for scope "${uploadId}". Run OCR first: POST /api/ocr/${uploadId}` },
      };
    }

    if (options.pageNumber !== undefined && !ocrOutput.pages.some((p) => p.pageNumber === options.pageNumber)) {
      return {
        statusCode: 400,
        body: {
          error: `Page ${options.pageNumber} not found in scope "${uploadId}". Available: ${ocrOutput.pages.map((p) => p.pageNumber).join(", ")}`,
        },
      };
    }

    if (queue.getActiveUploadId() === uploadId) {
      const existing = (await translateJobRepository.list()).find((r) => r.uploadId === uploadId);
      return {
        statusCode: 202,
        body: {
          message: `Upload "${uploadId}" is currently being translated.`,
          record: existing ?? buildTranslationRecord(uploadId, ocrOutput.pages.map((p) => p.pageNumber), targetLanguage),
        },
      };
    }

    const requestedPages = options.pageNumber !== undefined ? [options.pageNumber] : null;

    const existingEntry = queue.pendingEntries.find((e) => e.uploadId === uploadId);
    if (existingEntry) {
      if (requestedPages !== null && existingEntry.pageNumbers !== null) {
        for (const p of requestedPages) {
          if (!existingEntry.pageNumbers.includes(p)) existingEntry.pageNumbers.push(p);
        }
      } else {
        existingEntry.pageNumbers = null;
      }
      const record = (await translateJobRepository.list()).find((r) => r.uploadId === uploadId);
      return {
        statusCode: 202,
        body: { message: `Upload "${uploadId}" is already queued for translation.`, record },
      };
    }

    const allPageNumbers = ocrOutput.pages.map((p) => p.pageNumber);
    const existingRecord = (await translateJobRepository.list()).find((r) => r.uploadId === uploadId);

    // When retranslating specific pages, preserve the existing completed-page statuses.
    // Only reset the pages that are actually being re-translated to "pending".
    const now = nowIso();
    let updatedPageRecords: TranslationPageRecord[];
    if (existingRecord && requestedPages !== null) {
      const requestedSet = new Set(requestedPages);
      updatedPageRecords = existingRecord.pages.map((p) =>
        requestedSet.has(p.pageNumber) ? { pageNumber: p.pageNumber, status: "pending" as const, lastError: null } : p,
      );
    } else {
      updatedPageRecords = allPageNumbers.map((n) => ({ pageNumber: n, status: "pending" as const, lastError: null }));
    }

    const queuedRecord: TranslationJobRecord = {
      uploadId,
      status: queue.getActiveUploadId() === null && queue.pendingEntries.length === 0 ? "Processing" : "Queued",
      targetLanguage,
      outputFile: resolveTranslatedOutputFile(uploadId),
      pages: updatedPageRecords,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      lastError: null,
    };
    await translateJobRepository.upsert(queuedRecord);

    queue.pendingEntries.push({ uploadId, pageNumbers: requestedPages, targetLanguage, model: options.model });
    queue.kickProcessor();

    return {
      statusCode: 202,
      body: {
        message: queuedRecord.status === "Processing"
          ? `Upload "${uploadId}" was queued for translation and started immediately.`
          : `Upload "${uploadId}" was added to the translation queue.`,
        record: queuedRecord,
      },
    };
  };

  const getJob = async (uploadId: string) => {
    await queue.initialize();

    const ocrOutput = loadOcrOutputForTranslate(uploadId);
    if (!ocrOutput) {
      return {
        statusCode: 400,
        body: { error: `No OCR output found for scope "${uploadId}". Run OCR first.` },
      };
    }

    const record = (await translateJobRepository.list()).find((r) => r.uploadId === uploadId);
    if (!record) {
      return {
        statusCode: 400,
        body: { error: `No translation job found for scope "${uploadId}". POST /api/translate/${uploadId} first.` },
      };
    }

    if (record.status === "Processing" || record.status === "Queued") {
      return {
        statusCode: 202,
        body: { message: `Translation for "${uploadId}" is ${record.status.toLowerCase()}.`, record },
      };
    }

    return { statusCode: 200, body: { record, output: loadTranslationOutput(uploadId) } };
  };

  const getPageTranslation = (uploadId: string, pageNumber: number) => {
    const output = loadTranslationOutput(uploadId) ?? [];
    const page = output.find((p) => p.pageNumber === pageNumber);
    return { statusCode: 200, body: { lines: page?.lines ?? [] } };
  };

  const savePageTranslation = (uploadId: string, pageNumber: number, lines: TranslationOutput[0]["lines"]) => {
    const output = loadTranslationOutput(uploadId) ?? [];
    const existingMap = new Map(output.map((p) => [p.pageNumber, p]));
    existingMap.set(pageNumber, { pageNumber, lines });
    const sorted = [...existingMap.values()].sort((a, b) => a.pageNumber - b.pageNumber);
    saveTranslationOutput(uploadId, sorted);
    return { statusCode: 200, body: { ok: true } };
  };

  return { initialize: queue.initialize, getQueueStatus, enqueue, getJob, getPageTranslation, savePageTranslation };
};

export type TranslateQueueService = ReturnType<typeof createTranslateQueueService>;
