import { existsSync, readFileSync, writeFileSync } from "fs";
import { runOcrForInputPaths, runOcrForPreparedJobs, runOcrForSinglePage } from "../../ocr";
import { loadOcrPrepareManifest, prepareOcrInputs, saveOcrPrepareManifest } from "../../ocr/preparation.ts";
import { resolveOutputFileForScope, resolvePrepareDirForScope } from "../../ocr/runtime-context.ts";
import type { OcrModel } from "../../ocr/config";
import type { OcrLineItem, OcrOutput } from "../../ocr/interfaces";
import type { OcrJobRecord, OcrJobResultResponse, OcrQueueStatusResponse } from "../interfaces";
import type { OcrJobRepository, UploadRecordRepository } from "../repositories";
import { nowIso } from "../utils";
import { getLogger } from "../../logger.ts";
import { createQueueProcessor } from "./base-queue-processor.ts";
import {
  buildOcrReadyRecord,
  getOcrStoredRecordMap,
  listOcrReadyUploads,
  lookupOcrUpload,
  resolveUploadCreatedAt,
} from "./ocr-job-helpers.ts";

type OcrQueueEntry = { uploadId: string; model?: OcrModel; language?: string };

export const createOcrQueueService = (
  uploadRepository: UploadRecordRepository,
  ocrJobRepository: OcrJobRepository,
) => {
  /** In-memory progress for the currently-running OCR job. Keyed by uploadId. */
  const activeProgress = new Map<string, { pagesCompleted: number; pagesTotal: number }>();

  const queue = createQueueProcessor<OcrQueueEntry>({
    recoverPersistedJobs: async (push, kick) => {
      const records = await ocrJobRepository.list();
      const recoveredRecords = records.map((record) => {
        const status = record.status === ("Extracted" as string) ? "Completed" as const : record.status;
        if (status === "Completed" || status === "Ready") {
          return status !== record.status ? { ...record, status } : record;
        }
        return {
          ...record,
          status: "Queued" as const,
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null,
          lastError: status === "Processing"
            ? record.lastError ?? "Server restarted before OCR processing completed. The upload was re-queued."
            : record.lastError,
        };
      });

      await ocrJobRepository.upsertMany(recoveredRecords);

      for (const record of recoveredRecords
        .filter((r) => r.status === "Queued")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
        if (!queue.pendingEntries.some((e) => e.uploadId === record.uploadId)) {
          push({ uploadId: record.uploadId });
        }
      }

      if (queue.pendingEntries.length > 0) kick();
    },

    processEntry: async ({ uploadId, model, language }) => {
      const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);
      if (!lookup.uploadExists || lookup.ocrReadyRecords.length === 0) {
        await ocrJobRepository.upsert({
          ...(lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords))),
          status: "Ready",
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null,
          outputFile: null,
          lastError: `Upload ${uploadId} has no OCR-ready files.`,
        });
        return;
      }

      const processingRecord: OcrJobRecord = {
        ...(lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords))),
        status: "Processing",
        outputFile: null,
        updatedAt: nowIso(),
        startedAt: nowIso(),
        completedAt: null,
        lastError: null,
        pagesCompleted: null,
        pagesTotal: null,
      };
      await ocrJobRepository.upsert(processingRecord);

      const onProgress = (pagesCompleted: number, pagesTotal: number) => {
        activeProgress.set(uploadId, { pagesCompleted, pagesTotal });
      };

      try {
        const prepareDir = resolvePrepareDirForScope(uploadId);
        const manifest = loadOcrPrepareManifest(prepareDir);
        let outputFile: string;
        const logger = getLogger("ocr");
        if (manifest) {
          logger.info(`Using pre-prepared manifest for ${uploadId} (${manifest.length} job(s)).`);
          outputFile = await runOcrForPreparedJobs(manifest, prepareDir, uploadId, model, language, onProgress);
        } else {
          outputFile = await runOcrForInputPaths(
            lookup.ocrReadyRecords.map((record) => record.storedPath),
            uploadId,
            model,
            language,
            onProgress,
          );
        }

        activeProgress.delete(uploadId);
        await ocrJobRepository.upsert({
          ...processingRecord,
          status: "Completed",
          outputFile,
          updatedAt: nowIso(),
          completedAt: nowIso(),
          pagesCompleted: null,
          pagesTotal: null,
        });
      } catch (error) {
        activeProgress.delete(uploadId);
        await ocrJobRepository.upsert({
          ...processingRecord,
          status: "Ready",
          outputFile: null,
          updatedAt: nowIso(),
          startedAt: null,
          completedAt: null,
          lastError: error instanceof Error ? error.message : String(error),
          pagesCompleted: null,
          pagesTotal: null,
        });
      }
    },

    onEntryError: async (entry, error) => {
      const lookup = await lookupOcrUpload(entry.uploadId, uploadRepository, ocrJobRepository);
      await ocrJobRepository.upsert({
        ...(lookup.record ?? buildOcrReadyRecord(entry.uploadId)),
        status: "Ready",
        outputFile: null,
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        lastError: error instanceof Error ? error.message : String(error),
      });
    },
  });

  void queue.initialize();

  const prepareUpload = async (uploadId: string, storedPaths: string[]): Promise<void> => {
    const prepareDir = resolvePrepareDirForScope(uploadId);
    const { jobs } = await prepareOcrInputs(storedPaths, prepareDir);
    saveOcrPrepareManifest(jobs, prepareDir);
  };

  const getQueueStatus = async (): Promise<OcrQueueStatusResponse> => {
    await queue.initialize();
    const uploadMap = await listOcrReadyUploads(uploadRepository);
    const storedRecordMap = await getOcrStoredRecordMap(ocrJobRepository);
    const records = [...uploadMap.keys()]
      .map((uploadId) => storedRecordMap.get(uploadId) ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(uploadMap.get(uploadId) ?? [])))
      .sort((left, right) => left.uploadId.localeCompare(right.uploadId));

    return {
      activeUploadId: queue.getActiveUploadId(),
      queuedUploadIds: [...queue.pendingEntries.map((e) => e.uploadId)],
      records,
    };
  };

  const enqueue = async (
    uploadId: string,
    { force = false, model, language }: { force?: boolean; model?: OcrModel; language?: string } = {},
  ) => {
    await queue.initialize();
    const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);
    if (!lookup.uploadExists) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    if (lookup.ocrReadyRecords.length === 0) {
      return { statusCode: 400, body: { error: `Upload ${uploadId} has no OCR-ready files.` } };
    }

    const existingRecord = lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords));

    if (existingRecord.status === "Completed" && !force) {
      return {
        statusCode: 200,
        body: {
          message: `Upload ${uploadId} has already been completed and will not be re-queued. Use POST /api/ocr/${uploadId}?force=true to re-run.`,
          record: existingRecord,
        },
      };
    }

    if (queue.getActiveUploadId() === uploadId) {
      return {
        statusCode: 202,
        body: {
          message: `Upload ${uploadId} is already being processed.`,
          record: { ...existingRecord, status: "Processing" as const },
        },
      };
    }

    if (queue.pendingEntries.some((e) => e.uploadId === uploadId) || existingRecord.status === "Queued") {
      return {
        statusCode: 202,
        body: {
          message: `Upload ${uploadId} is already queued for OCR extraction.`,
          record: { ...existingRecord, status: "Queued" as const },
        },
      };
    }

    const shouldStartImmediately = queue.getActiveUploadId() === null && queue.pendingEntries.length === 0;
    const queuedRecord: OcrJobRecord = {
      ...existingRecord,
      status: shouldStartImmediately ? "Processing" : "Queued",
      outputFile: null,
      updatedAt: nowIso(),
      startedAt: shouldStartImmediately ? nowIso() : null,
      completedAt: null,
      lastError: null,
    };
    await ocrJobRepository.upsert(queuedRecord);

    if (queue.getActiveUploadId() !== uploadId && !queue.pendingEntries.some((e) => e.uploadId === uploadId)) {
      queue.pendingEntries.push({ uploadId, model, language });
    }

    queue.kickProcessor();
    return {
      statusCode: 202,
      body: {
        message: shouldStartImmediately
          ? `Upload ${uploadId} was added to the OCR queue and started processing immediately.`
          : `Upload ${uploadId} was added to the OCR queue.`,
        record: queuedRecord,
      },
    };
  };

  const remove = async (uploadId: string) => {
    await queue.initialize();
    const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);
    if (!lookup.uploadExists) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    if (queue.getActiveUploadId() === uploadId) {
      return {
        statusCode: 409,
        body: { error: `Upload ${uploadId} is currently being processed and cannot be removed from the queue.` },
      };
    }

    const queueIndex = queue.pendingEntries.findIndex((e) => e.uploadId === uploadId);
    if (queueIndex === -1) {
      return { statusCode: 400, body: { error: `Upload ${uploadId} is not currently queued.` } };
    }

    queue.pendingEntries.splice(queueIndex, 1);
    const readyRecord: OcrJobRecord = {
      ...(lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords))),
      status: "Ready",
      updatedAt: nowIso(),
      startedAt: null,
      completedAt: null,
      lastError: null,
    };
    await ocrJobRepository.upsert(readyRecord);

    return {
      statusCode: 200,
      body: { message: `Upload ${uploadId} was removed from the OCR queue.`, record: readyRecord },
    };
  };

  const getJob = async (uploadId: string) => {
    await queue.initialize();
    const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);
    if (!lookup.uploadExists) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    if (lookup.ocrReadyRecords.length === 0) {
      return { statusCode: 400, body: { error: `Upload ${uploadId} has no OCR-ready files.` } };
    }

    const record = lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords));

    if (record.status === "Ready") {
      return {
        statusCode: 400,
        body: {
          error: `Upload ${uploadId} is ready but has not been queued. POST /api/ocr/${uploadId} first.`,
          record,
        },
      };
    }

    if (record.status === "Queued") {
      return {
        statusCode: 202,
        body: { message: `Upload ${uploadId} is queued and waiting for OCR processing to start.`, record },
      };
    }

    if (record.status === "Processing") {
      const progress = activeProgress.get(uploadId);
      return {
        statusCode: 202,
        body: {
          message: `Upload ${uploadId} is still being processed.`,
          record: progress
            ? { ...record, pagesCompleted: progress.pagesCompleted, pagesTotal: progress.pagesTotal }
            : record,
        },
      };
    }

    if (!record.outputFile || !existsSync(record.outputFile)) {
      return { statusCode: 500, body: { error: `OCR output for upload ${uploadId} is missing.` } };
    }

    const output = JSON.parse(readFileSync(record.outputFile, "utf8")) as OcrOutput;
    const response: OcrJobResultResponse = { record, output };
    return { statusCode: 200, body: response };
  };

  const getPageLines = async (uploadId: string, pageNumber: number) => {
    await queue.initialize();
    const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);
    if (!lookup.uploadExists) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    if (lookup.ocrReadyRecords.length === 0) {
      return { statusCode: 400, body: { error: `Upload ${uploadId} has no OCR-ready files.` } };
    }

    const record = lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords));
    if (record.status !== "Completed") {
      return {
        statusCode: 202,
        body: {
          error: `OCR for upload ${uploadId} is not completed yet.`,
          record,
        },
      };
    }

    if (!record.outputFile || !existsSync(record.outputFile)) {
      return { statusCode: 500, body: { error: `OCR output for upload ${uploadId} is missing.` } };
    }

    const output = JSON.parse(readFileSync(record.outputFile, "utf8")) as OcrOutput;
    const page = output.pages.find((p) => p.pageNumber === pageNumber);
    if (!page) {
      return { statusCode: 404, body: { error: `Page ${pageNumber} not found in upload ${uploadId}.` } };
    }

    return {
      statusCode: 200,
      body: {
        pageNumber,
        lines: page.lines,
      },
    };
  };

  const normalizeEditableLine = (line: OcrLineItem, index: number): OcrLineItem => {
    const normalizedBox = line.box
      ? [
        Math.min(line.box[0], line.box[2]),
        Math.min(line.box[1], line.box[3]),
        Math.max(line.box[0], line.box[2]),
        Math.max(line.box[1], line.box[3]),
      ] as [number, number, number, number]
      : null;

    const normalizedPolygon = line.polygon && line.polygon.length >= 3
      ? line.polygon.map((p) => [Number(p[0]), Number(p[1])] as [number, number])
      : null;

    return {
      lineIndex: index,
      text: line.text,
      box: normalizedBox,
      polygon: normalizedPolygon,
      orientation: line.orientation ?? null,
    };
  };

  const updatePageLines = async (uploadId: string, pageNumber: number, lines: OcrLineItem[]) => {
    await queue.initialize();

    if (queue.getActiveUploadId() === uploadId) {
      return {
        statusCode: 409,
        body: { error: `Scope "${uploadId}" is currently being processed. Save is blocked during OCR.` },
      };
    }

    const outputFile = resolveOutputFileForScope(uploadId);
    if (!existsSync(outputFile)) {
      return {
        statusCode: 400,
        body: { error: `OCR output for upload ${uploadId} does not exist yet. Run OCR first.` },
      };
    }

    const output = JSON.parse(readFileSync(outputFile, "utf8")) as OcrOutput;
    const pageIndex = output.pages.findIndex((p) => p.pageNumber === pageNumber);
    if (pageIndex < 0) {
      return {
        statusCode: 400,
        body: { error: `Page ${pageNumber} not found in scope "${uploadId}".` },
      };
    }

    output.pages[pageIndex] = {
      ...output.pages[pageIndex],
      lines: lines.map(normalizeEditableLine),
    };
    output.generatedAt = new Date().toISOString();

    writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf8");

    const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);
    await ocrJobRepository.upsert({
      ...(lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords))),
      status: "Completed",
      outputFile,
      updatedAt: nowIso(),
      completedAt: nowIso(),
      lastError: null,
      pagesCompleted: null,
      pagesTotal: null,
    });

    return {
      statusCode: 200,
      body: {
        message: `Saved OCR edits for page ${pageNumber} in scope "${uploadId}".`,
        outputFile,
      },
    };
  };

  const enqueuePage = async (uploadId: string, pageNumber: number, model?: OcrModel, language?: string) => {
    await queue.initialize();
    const outputFile = resolveOutputFileForScope(uploadId);
    const lookup = await lookupOcrUpload(uploadId, uploadRepository, ocrJobRepository);

    if (!lookup.uploadExists) {
      return { statusCode: 404, body: { error: `Upload ${uploadId} was not found.` } };
    }

    if (lookup.ocrReadyRecords.length === 0) {
      return { statusCode: 400, body: { error: `Upload ${uploadId} has no OCR-ready files.` } };
    }

    if (existsSync(outputFile)) {
      // OCR output already exists — validate the requested page is in range
      const existing = JSON.parse(readFileSync(outputFile, "utf8")) as OcrOutput;
      const targetPage = existing.pages.find((p) => p.pageNumber === pageNumber);
      if (!targetPage) {
        return {
          statusCode: 400,
          body: {
            error: `Page ${pageNumber} not found in scope "${uploadId}". Available: ${existing.pages.map((p) => p.pageNumber).join(", ")}`,
          },
        };
      }
    } else {
      // No OCR output yet — check page range against manifest and bootstrap it when missing.
      const prepareDir = resolvePrepareDirForScope(uploadId);
      let manifest = loadOcrPrepareManifest(prepareDir);
      if (!manifest || manifest.length === 0) {
        await prepareUpload(uploadId, lookup.ocrReadyRecords.map((record) => record.storedPath));
        manifest = loadOcrPrepareManifest(prepareDir);
      }

      if (manifest && manifest.length > 0 && (pageNumber < 1 || pageNumber > manifest.length)) {
        return {
          statusCode: 400,
          body: { error: `Page ${pageNumber} is out of range. Upload "${uploadId}" has ${manifest.length} page(s).` },
        };
      }
    }

    if (queue.getActiveUploadId() === uploadId) {
      return {
        statusCode: 409,
        body: { error: `Scope "${uploadId}" is currently being processed. Try again after it completes.` },
      };
    }

    try {
      const { linesFound } = await runOcrForSinglePage(uploadId, pageNumber, model, language);
      const completedRecord: OcrJobRecord = {
        ...(lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords))),
        status: "Completed",
        outputFile,
        updatedAt: nowIso(),
        startedAt: nowIso(),
        completedAt: nowIso(),
        lastError: null,
        pagesCompleted: null,
        pagesTotal: null,
      };
      await ocrJobRepository.upsert(completedRecord);

      return {
        statusCode: 200,
        body: {
          message: `Page ${pageNumber} of scope "${uploadId}" re-extracted successfully. ${linesFound} line(s) found.`,
          pageNumber,
          linesFound,
          outputFile,
        },
      };
    } catch (error) {
      await ocrJobRepository.upsert({
        ...(lookup.record ?? buildOcrReadyRecord(uploadId, resolveUploadCreatedAt(lookup.ocrReadyRecords))),
        status: "Ready",
        outputFile: null,
        updatedAt: nowIso(),
        startedAt: null,
        completedAt: null,
        lastError: error instanceof Error ? error.message : String(error),
        pagesCompleted: null,
        pagesTotal: null,
      });

      return {
        statusCode: 500,
        body: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  };

  return {
    initialize: queue.initialize,
    prepareUpload,
    getQueueStatus,
    enqueue,
    remove,
    getJob,
    getPageLines,
    enqueuePage,
    updatePageLines,
  };
};

export type OcrQueueService = ReturnType<typeof createOcrQueueService>;
