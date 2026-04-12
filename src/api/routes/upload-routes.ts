import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import { jsonResponse } from "../utils";
import { ocrPrepareRootDir, textlessRootDir } from "../../config.ts";
import { deleteUpload } from "../services/delete-service.ts";
import type { UploadService } from "../services";
import type { OcrQueueService } from "../services";
import { getLogger } from "../../logger.ts";
import { resolveOutputFileForScope } from "../../ocr/runtime-context.ts";
import type { OcrOutput } from "../../ocr/interfaces";

export const createUploadRoutes = (
  uploadService: UploadService,
  ocrQueueService: OcrQueueService,
) => {
  const getRequestFiles = async (request: Request): Promise<File[]> => {
    const formData = await request.formData();
    const files: File[] = [];
    for (const value of formData.values()) {
      if (typeof value !== "string") files.push(value);
    }
    return files;
  };

  const handleGetFiles = async () => {
    const records = await uploadService.listUploads();
    // For each uploadId, count prepared pages (extracted from PDF/ZIP) in the OCR prepare dir
    const uploadIds = [...new Set(records.map((r) => r.uploadId))];
    const pageCounts: Record<string, number> = {};
    for (const uploadId of uploadIds) {
      const imagesDir = join(ocrPrepareRootDir, uploadId, "images");
      if (existsSync(imagesDir)) {
        const files = readdirSync(imagesDir).filter((f) =>
          /\.(png|jpe?g|webp)$/i.test(f),
        );
        if (files.length > 0) pageCounts[uploadId] = files.length;
      }
    }
    return jsonResponse({ records, pageCounts });
  };

  const handlePostUpload = async (request: Request) => {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return jsonResponse({ error: "Expected multipart/form-data request body." }, 415);
    }

    const files = await getRequestFiles(request);
    if (files.length === 0) {
      return jsonResponse(
        { error: "No files were provided. Submit one or more files in multipart form data." },
        400,
      );
    }

    const result = await uploadService.storeUploads(files);
    if (result.ocrReadyRecords.length === 0) {
      return jsonResponse({ error: "No supported OCR input files were stored.", result }, 400);
    }

    // Split PDFs and copy images into the prepare directory immediately after upload,
    // so OCR can operate directly on the already-prepared files without re-doing this work.
    try {
      await ocrQueueService.prepareUpload(
        result.uploadId,
        result.ocrReadyRecords.map((r) => r.storedPath),
      );
    } catch (error) {
      getLogger("upload").error(`OCR pre-preparation failed for ${result.uploadId}:`, error);
      // Non-fatal: OCR queue will fall back to preparing at queue time
    }

    return jsonResponse(result, 201);
  };

  const handleGetUploadCover = async (uploadId: string): Promise<Response> => {
    const serveFile = (filePath: string, contentType = "image/jpeg") =>
      new Response(Bun.file(filePath), {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
      });

    // First, check the OCR prepare directory for extracted/split images — these are always
    // proper rasterised images and work as covers for PDFs, ZIPs, or raw image batches.
    const imagesDir = join(ocrPrepareRootDir, uploadId, "images");
    if (existsSync(imagesDir)) {
      const prepared = readdirSync(imagesDir)
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .sort();
      if (prepared.length > 0) {
        return serveFile(join(imagesDir, prepared[0]));
      }
    }

    // Fallback: look at upload records for a direct image or zip-entry
    const allRecords = await uploadService.listUploads();
    const records = allRecords.filter((r) => r.uploadId === uploadId);
    if (records.length === 0) return new Response(null, { status: 404 });

    for (const type of ["image", "zip-entry"] as const) {
      const cover = records.find((r) => r.sourceType === type && existsSync(r.storedPath));
      if (cover) return serveFile(cover.storedPath, cover.contentType ?? "image/jpeg");
    }

    return new Response(null, { status: 404 });
  };

  const handleGetUploadPages = (uploadId: string): Response => {
    const imagesDir = join(ocrPrepareRootDir, uploadId, "images");
    if (!existsSync(imagesDir)) return jsonResponse({ pages: [] });
    const pages = readdirSync(imagesDir)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort();
    return jsonResponse({ pages });
  };

  const handleGetUploadPage = (uploadId: string, index: number): Response => {
    const imagesDir = join(ocrPrepareRootDir, uploadId, "images");
    if (!existsSync(imagesDir)) return new Response(null, { status: 404 });
    const pages = readdirSync(imagesDir)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort();
    const file = pages[index];
    if (!file) return new Response(null, { status: 404 });
    const ext = file.split(".").pop()?.toLowerCase() ?? "png";
    const contentType =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "webp" ? "image/webp" : "image/png";
    return new Response(Bun.file(join(imagesDir, file)), {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" },
    });
  };

  const handleGetTextlessPage = (
    uploadId: string,
    index: number,
    method: "GET" | "HEAD" = "GET",
  ): Response => {
    const ocrOutputFile = resolveOutputFileForScope(uploadId);
    if (!existsSync(ocrOutputFile)) return new Response(null, { status: 404 });

    let expectedFileNames: string[] = [];
    try {
      const ocrOutput = JSON.parse(readFileSync(ocrOutputFile, "utf8")) as OcrOutput;
      const pageNumber = index + 1;
      const page = ocrOutput.pages.find((p) => p.pageNumber === pageNumber);
      if (page) {
        const fromFilePath = basename(page.filePath || "");
        const fromFileName = page.fileName || "";
        expectedFileNames = [...new Set([fromFilePath, fromFileName].filter(Boolean))];
      }
    } catch {
      return new Response(null, { status: 404 });
    }

    if (expectedFileNames.length === 0) return new Response(null, { status: 404 });

    const imagesDir = join(textlessRootDir, uploadId);
    const matchedName = expectedFileNames.find((name) => existsSync(join(imagesDir, name)));
    if (!matchedName) return new Response(null, { status: 404 });

    const filePath = join(imagesDir, matchedName);
    const stat = Bun.file(filePath);

    const ext = matchedName.split(".").pop()?.toLowerCase() ?? "png";
    const contentType =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "webp" ? "image/webp" : "image/png";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Content-Length": String(stat.size),
      "Last-Modified": new Date(stat.lastModified).toUTCString(),
    };
    if (method === "HEAD") return new Response(null, { headers });
    return new Response(stat, { headers });
  };

  const handleDeleteUpload = async (uploadId: string): Promise<Response> => {
    const allRecords = await uploadService.listUploads();
    const exists = allRecords.some((r) => r.uploadId === uploadId);
    if (!exists) return jsonResponse({ error: "Upload not found." }, 404);
    await deleteUpload(uploadId);
    return jsonResponse({ deleted: uploadId });
  };

  return {
    handleGetFiles,
    handlePostUpload,
    handleGetUploadCover,
    handleGetUploadPages,
    handleGetUploadPage,
    handleGetTextlessPage,
    handleDeleteUpload,
  };
};
