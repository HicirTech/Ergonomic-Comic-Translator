/**
 * Text removal script — removes text from OCR'd comic pages using
 * the local Python textless pipeline (PaddleOCR boxes + lama_large inpainting).
 *
 * Usage:
 *   bun run textless {id} [page]
 *
 *   id   — OCR output scope (uploadId or "ocr" for direct CLI runs)
 *   page — optional 1-based page number; omit to process all pages
 */
import { mkdirSync } from "fs";
import { getLogger } from "../logger.ts";
import {
  loadOcrOutput,
  processTextlessPage,
  resolveTextlessDir,
} from "../api/services/textless-processing.ts";
import { parseCliArgs } from "./cli-utils.ts";

const main = async () => {
  const { logger, scope, pageNumber } = parseCliArgs({
    name: "textless",
    description: "Remove text from OCR'd comic pages",
  });

  const ocrOutput = loadOcrOutput(scope);
  if (!ocrOutput) {
    logger.error(`OCR output not found for scope "${scope}".`);
    logger.error("Run OCR first: bun run ocr  or  POST /api/ocr/{uploadId}");
    process.exit(1);
  }

  if (ocrOutput.pages.length === 0) {
    logger.error(`OCR output has no pages for scope "${scope}".`);
    process.exit(1);
  }

  const pagesToProcess = pageNumber
    ? ocrOutput.pages.filter((p) => p.pageNumber === pageNumber)
    : ocrOutput.pages;

  if (pagesToProcess.length === 0) {
    logger.error(`Page ${pageNumber} not found. Available pages: ${ocrOutput.pages.map((p) => p.pageNumber).join(", ")}`);
    process.exit(1);
  }

  logger.info("Mode: local Python textless pipeline");

  const outputDir = resolveTextlessDir(scope);
  mkdirSync(outputDir, { recursive: true });

  logger.info(`Scope: ${scope}`);
  logger.info(`Pages: ${pagesToProcess.length} of ${ocrOutput.pages.length}`);
  logger.info(`Output: ${outputDir}\n`);

  const totalStart = Date.now();
  let successCount = 0;

  for (const page of pagesToProcess) {
    logger.info(`Page ${page.pageNumber}: ${page.fileName}`);
    const startedAt = Date.now();

    const result = await processTextlessPage(page, outputDir, scope);
    if (result.success) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      logger.info(`Page ${page.pageNumber}: done in ${elapsed}s`);
      successCount += 1;
    } else {
      logger.error(`Page ${page.pageNumber} failed: ${result.error}`);
    }
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  logger.info(`\nComplete: ${successCount}/${pagesToProcess.length} page(s) in ${totalElapsed}s`);
  logger.info(`Output directory: ${outputDir}`);
};

void main().catch((error: unknown) => {
  getLogger("textless").error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
