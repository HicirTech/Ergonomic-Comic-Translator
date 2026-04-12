import { existsSync } from "fs";
import { basename } from "path";
import type {
  TextlessJobRecord,
  TextlessPageRecord,
  TextlessQueueStatusResponse,
} from "../interfaces";
import type { TextlessJobRepository, UploadRecordRepository } from "../repositories";
import { nowIso } from "../utils";
import {
  loadOcrOutput,
  processTextlessPage,
  resolveTextlessDir,
  type TextlessPageInput,
} from "./textless-processing.ts";
import { createQueueProcessor } from "./base-queue-processor.ts";

type TextlessQueueEntry = { uploadId: string; pageNumbers: number[] | null };

const buildPageRecords = (
  ocrPages: Array<{ pageNumber: number; fileName: string }>,
  pageNumbers: number[] | null,
): TextlessPageRecord[] => {
  const targetPages = pageNumbers === null
    ? ocrPages
    : ocrPages.filter((p) => pageNumbers.includes(p.pageNumber));
  return targetPages.map((p) => ({
    pageNumber: p.pageNumber,
    fileName: p.fileName,
    status: "pending" as const,
    lastError: null,
  }));
};

const buildTextlessRecord = (
  uploadId: string,
  ocrPages: Array<{ pageNumber: number; fileName: string }>,
): TextlessJobRecord => ({
  uploadId,
  status: "Ready",
  pages: ocrPages.map((p) => ({
    pageNumber: p.pageNumber,
    fileName: p.fileName,
    status: "pending" as const,
    lastError: null,
  })),
  createdAt: nowIso(),
  updatedAt: nowIso(),
  startedAt: null,
  completedAt: null,
  lastError: null,
});

const buildQueuedTextlessRecord = (
  uploadId: string,
  ocrPages: Array<{ pageNumber: number; fileName: string }>,
  pageNumbers: number[] | null,
): TextlessJobRecord => ({
  uploadId,
  status: "Queued",
  pages: buildPageRecords(ocrPages, pageNumbers),
  createdAt: nowIso(),
  updatedAt: nowIso(),
  startedAt: null,
  completedAt: null,
  lastError: null,
});

export const createTextlessQueueService = (
  uploadRepository: UploadRecordRepository,
  textlessJobRepository: TextlessJobRepository,
) => {
  const queue = createQueueProcessor<TextlessQueueEntry>({
    recoverPersistedJobs: async (push, kick) => {
      const records = await textlessJobRepository.list();
      const recoveredRecords = records.map((record) => {
        if (record.status === "Completed" || record.status === "Ready") return record;
        return {
          ...record,
          status: "Queued" as const,
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null,
          lastError: record.status === "Processing"
            ? record.lastError ?? "Server restarted before textless processing completed. The job was re-queued."
            : record.lastError,
          pages: record.pages.map((p) =>
            p.status === "pending" ? p : { ...p, status: "pending" as const, lastError: null },
          ),
        };
      });

      await textlessJobRepository.upsertMany(recoveredRecords);

      for (const record of recoveredRecords
        .filter((r) => r.status === "Queued")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
        if (!queue.pendingEntries.some((e) => e.uploadId === record.uploadId)) {
          const pendingPages = record.pages.filter((p) => p.status === "pending").map((p) => p.pageNumber);
          push({
            uploadId: record.uploadId,
            pageNumbers: pendingPages.length === record.pages.length ? null : pendingPages,
          });
        }
      }

      if (queue.pendingEntries.length > 0) kick();
    },

    processEntry: async (entry) => {
      const ocrOutput = loadOcrOutput(entry.uploadId);
      if (!ocrOutput || ocrOutput.pages.length === 0) {
        const records = await textlessJobRepository.list();
        const existingRecord = records.find((r) => r.uploadId === entry.uploadId);
        if (existingRecord) {
          await textlessJobRepository.upsert({
            ...existingRecord,
            status: "Ready",
            updatedAt: nowIso(),
            lastError: `OCR output not found for upload ${entry.uploadId}.`,
          });
        }
        return;
      }

      const rawPages: TextlessPageInput[] = entry.pageNumbers === null
        ? ocrOutput.pages
        : ocrOutput.pages.filter((p) => entry.pageNumbers!.includes(p.pageNumber));

      // Resolve source paths: prepared images in ocr_prepare are ephemeral.
      // If the prepared path is gone, fall back to the original upload record.
      const uploadRecords = await uploadRepository.list();
      const uploadRecordsForId = uploadRecords.filter((r) => r.uploadId === entry.uploadId);
      const pagesToProcess: TextlessPageInput[] = rawPages.map((page) => {
        if (existsSync(page.filePath)) return page;
        const match = uploadRecordsForId.find(
          (r) => r.storedName === page.fileName || basename(r.storedPath) === page.fileName,
        );
        return match ? { ...page, filePath: match.storedPath } : page;
      });

      const processingRecord: TextlessJobRecord = {
        uploadId: entry.uploadId,
        status: "Processing",
        pages: pagesToProcess.map((p) => ({
          pageNumber: p.pageNumber,
          fileName: p.fileName,
          status: "pending" as const,
          lastError: null,
        })),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedAt: nowIso(),
        completedAt: null,
        lastError: null,
      };
      await textlessJobRepository.upsert(processingRecord);

      const outputDir = resolveTextlessDir(entry.uploadId);

      for (const pageRecord of processingRecord.pages) {
        const page = pagesToProcess.find((p) => p.pageNumber === pageRecord.pageNumber);
        if (!page) continue;

        const result = await processTextlessPage(page, outputDir, entry.uploadId);
        pageRecord.status = result.success ? "completed" : "failed";
        pageRecord.lastError = result.error;

        processingRecord.updatedAt = nowIso();
        await textlessJobRepository.upsert(processingRecord);
      }

      const anyFailed = processingRecord.pages.some((p) => p.status === "failed");
      processingRecord.status = "Completed";
      processingRecord.updatedAt = nowIso();
      processingRecord.completedAt = nowIso();
      if (anyFailed) {
        const failedPages = processingRecord.pages.filter((p) => p.status === "failed");
        processingRecord.lastError = `${failedPages.length} page(s) failed: ${failedPages.map((p) => p.pageNumber).join(", ")}`;
      }

      await textlessJobRepository.upsert(processingRecord);
    },

    onEntryError: async (entry, error) => {
      const records = await textlessJobRepository.list();
      const existingRecord = records.find((r) => r.uploadId === entry.uploadId);
      if (existingRecord) {
        await textlessJobRepository.upsert({
          ...existingRecord,
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

  const getQueueStatus = async (): Promise<TextlessQueueStatusResponse> => {
    await queue.initialize();
    const records = await textlessJobRepository.list();
    return {
      activeUploadId: queue.getActiveUploadId(),
      queuedUploadIds: queue.pendingEntries.map((entry) => entry.uploadId),
      records: records.sort((left, right) => left.uploadId.localeCompare(right.uploadId)),
    };
  };

  const enqueue = async (uploadId: string, pageNumber?: number) => {
    await queue.initialize();

    const uploadRecords = await uploadRepository.list();
    if (!uploadRecords.some((r) => r.uploadId === uploadId)) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    const ocrOutput = loadOcrOutput(uploadId);
    if (!ocrOutput || ocrOutput.pages.length === 0) {
      return {
        statusCode: 400,
        body: { error: `Upload ${uploadId} has no OCR output. Run OCR first: POST /api/ocr/${uploadId}` },
      };
    }

    if (pageNumber !== undefined && !ocrOutput.pages.some((p) => p.pageNumber === pageNumber)) {
      return {
        statusCode: 400,
        body: {
          error: `Page ${pageNumber} not found in upload ${uploadId}. Available pages: ${ocrOutput.pages.map((p) => p.pageNumber).join(", ")}`,
        },
      };
    }

    if (queue.getActiveUploadId() === uploadId) {
      const existingRecord = (await textlessJobRepository.list()).find((r) => r.uploadId === uploadId);
      return {
        statusCode: 202,
        body: {
          message: `Upload ${uploadId} is currently being processed.`,
          record: existingRecord ?? buildTextlessRecord(uploadId, ocrOutput.pages),
        },
      };
    }

    const requestedPages = pageNumber !== undefined ? [pageNumber] : null;

    const existingEntryIndex = queue.pendingEntries.findIndex((e) => e.uploadId === uploadId);
    if (existingEntryIndex !== -1) {
      const existingEntry = queue.pendingEntries[existingEntryIndex];
      if (requestedPages === null) {
        existingEntry.pageNumbers = null;
      } else if (existingEntry.pageNumbers !== null) {
        for (const pn of requestedPages) {
          if (!existingEntry.pageNumbers.includes(pn)) existingEntry.pageNumbers.push(pn);
        }
      }

      const record = buildQueuedTextlessRecord(uploadId, ocrOutput.pages, existingEntry.pageNumbers);
      await textlessJobRepository.upsert(record);
      return {
        statusCode: 202,
        body: {
          message: pageNumber !== undefined
            ? `Page ${pageNumber} was added to the queued textless job for upload ${uploadId}.`
            : `Upload ${uploadId} was re-queued for all pages.`,
          record,
        },
      };
    }

    const shouldStartImmediately = queue.getActiveUploadId() === null && queue.pendingEntries.length === 0;
    queue.pendingEntries.push({ uploadId, pageNumbers: requestedPages });

    const record: TextlessJobRecord = {
      uploadId,
      status: shouldStartImmediately ? "Processing" : "Queued",
      pages: buildPageRecords(ocrOutput.pages, requestedPages),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      startedAt: shouldStartImmediately ? nowIso() : null,
      completedAt: null,
      lastError: null,
    };
    await textlessJobRepository.upsert(record);
    queue.kickProcessor();

    return {
      statusCode: 202,
      body: {
        message: shouldStartImmediately
          ? `Upload ${uploadId} was added to the textless queue and started processing immediately.`
          : `Upload ${uploadId} was added to the textless queue.`,
        record,
      },
    };
  };

  const getJob = async (uploadId: string) => {
    await queue.initialize();

    const uploadRecords = await uploadRepository.list();
    if (!uploadRecords.some((r) => r.uploadId === uploadId)) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    const records = await textlessJobRepository.list();
    const record = records.find((r) => r.uploadId === uploadId);
    if (!record) {
      return {
        statusCode: 200,
        body: { message: `Upload ${uploadId} has not been queued for textless processing.`, record: null },
      };
    }

    if (record.status === "Queued") {
      return {
        statusCode: 202,
        body: { message: `Upload ${uploadId} is queued and waiting for textless processing.`, record },
      };
    }

    if (record.status === "Processing") {
      return {
        statusCode: 202,
        body: { message: `Upload ${uploadId} is being processed.`, record },
      };
    }

    return {
      statusCode: 200,
      body: {
        message: `Upload ${uploadId} textless processing is ${record.status.toLowerCase()}.`,
        record,
        outputDir: resolveTextlessDir(uploadId),
      },
    };
  };

  return { initialize: queue.initialize, getQueueStatus, enqueue, getJob };
};

export type TextlessQueueService = ReturnType<typeof createTextlessQueueService>;
