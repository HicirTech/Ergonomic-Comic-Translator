import { mkdirSync } from "fs";
import { basename, dirname, extname, relative, resolve } from "path";
import { projectRoot } from "../../config.ts";
import type { UploadBatchResult, UploadRecord, UploadRecordSourceType, UploadSkipItem } from "../interfaces";
import type { UploadRecordRepository } from "../repositories";
import {
  apiUploadsRootDir,
  supportedArchiveExtensions,
  supportedArchiveExtractExtensions,
  supportedDocumentExtensions,
  supportedUploadExtensions,
} from "../../config.ts";
import { buildUniqueFilePath, extractZipEntries, hasSupportedExtension, sanitizeArchiveEntryPath, sanitizeFileName, sanitizePathSegment } from "../utils";

interface StoredUploadRecordInput {
  uploadId: string;
  uploadDir: string;
  originalName: string;
  sourceType: UploadRecordSourceType;
  contentType: string | null;
  data: Uint8Array | ArrayBuffer;
  relativePath: string;
  archiveName?: string | null;
  archiveEntryName?: string | null;
}

export const createUploadService = (repository: UploadRecordRepository) => {
  const storeRecord = async (input: StoredUploadRecordInput): Promise<UploadRecord> => {
    const uniqueTarget = buildUniqueFilePath(input.uploadDir, input.relativePath);
    mkdirSync(dirname(uniqueTarget.absolutePath), { recursive: true });
    await Bun.write(uniqueTarget.absolutePath, input.data);

    const size = input.data instanceof ArrayBuffer ? input.data.byteLength : input.data.byteLength;
    return {
      uploadId: input.uploadId,
      sourceType: input.sourceType,
      originalName: input.originalName,
      storedName: uniqueTarget.storedName,
      storedPath: uniqueTarget.absolutePath,
      relativePath: relative(projectRoot, uniqueTarget.absolutePath),
      contentType: input.contentType,
      size,
      createdAt: new Date().toISOString(),
      archiveName: input.archiveName ?? null,
      archiveEntryName: input.archiveEntryName ?? null,
    };
  };

  const storeZipUpload = async ({
    file,
    uploadId,
    uploadDir,
    skippedEntries,
  }: {
    file: File;
    uploadId: string;
    uploadDir: string;
    skippedEntries: UploadSkipItem[];
  }): Promise<UploadRecord[]> => {
    const archiveName = sanitizeFileName(file.name || "archive.zip");
    const archiveBaseName = sanitizePathSegment(basename(archiveName, extname(archiveName)));
    const records: UploadRecord[] = [];

    records.push(
      await storeRecord({
        uploadId,
        uploadDir,
        originalName: file.name || archiveName,
        sourceType: "zip",
        contentType: file.type || "application/zip",
        data: await file.arrayBuffer(),
        relativePath: `_archives/${archiveName}`,
      }),
    );

    const entries = await extractZipEntries(file);
    for (const entry of entries) {
      const sanitizedEntryPath = sanitizeArchiveEntryPath(entry.name);
      if (!sanitizedEntryPath) {
        skippedEntries.push({
          name: entry.name,
          reason: "Archive entry path is empty after sanitization.",
        });
        continue;
      }

      if (!hasSupportedExtension(sanitizedEntryPath, supportedArchiveExtractExtensions)) {
        skippedEntries.push({
          name: `${archiveName}:${entry.name}`,
          reason: `Archive entry extension is unsupported. Extractable extensions: ${supportedArchiveExtractExtensions.join(", ")}.`,
        });
        continue;
      }

      records.push(
        await storeRecord({
          uploadId,
          uploadDir,
          originalName: entry.name,
          sourceType: "zip-entry",
          contentType: null,
          data: entry.data,
          relativePath: `${archiveBaseName}/${sanitizedEntryPath}`,
          archiveName,
          archiveEntryName: entry.name,
        }),
      );
    }

    return records;
  };

  const listUploads = () => repository.list();

  const storeUploads = async (files: File[]): Promise<UploadBatchResult> => {
    const uploadId = crypto.randomUUID();
    const uploadDir = resolve(apiUploadsRootDir, uploadId);
    mkdirSync(uploadDir, { recursive: true });

    const storedRecords: UploadRecord[] = [];
    const skippedEntries: UploadSkipItem[] = [];

    for (const file of files) {
      const originalName = sanitizeFileName(file.name || "upload");
      if (!hasSupportedExtension(originalName, supportedUploadExtensions)) {
        skippedEntries.push({
          name: file.name || "unnamed-file",
          reason: `Unsupported file extension. Supported extensions: ${supportedUploadExtensions.join(", ")}.`,
        });
        continue;
      }

      if (hasSupportedExtension(originalName, supportedArchiveExtensions)) {
        const archiveRecords = await storeZipUpload({ file, uploadId, uploadDir, skippedEntries });
        storedRecords.push(...archiveRecords);
        continue;
      }

      storedRecords.push(
        await storeRecord({
          uploadId,
          uploadDir,
          originalName: file.name || originalName,
          sourceType: hasSupportedExtension(originalName, supportedDocumentExtensions) ? "pdf" : "image",
          contentType: file.type || null,
          data: await file.arrayBuffer(),
          relativePath: sanitizeFileName(originalName),
        }),
      );
    }

    await repository.saveMany(storedRecords);

    return {
      uploadId,
      storedRecords,
      ocrReadyRecords: storedRecords.filter((record) => record.sourceType !== "zip"),
      skippedEntries,
    };
  };

  return { listUploads, storeUploads };
};

export type UploadService = ReturnType<typeof createUploadService>;
