/**
 * Translation script — translates OCR'd comic text using a local Ollama model.
 *
 * Usage:
 *   bun run translate {id} [page] [--lang <language>]
 *
 *   id     — OCR output scope (uploadId or "ocr" for direct CLI runs)
 *   page   — optional 1-based page number; omit to translate all pages
 *   --lang — target language (default: Chinese)
 */
import { getLogger } from "../logger.ts";
import { defaultTranslateTargetLanguage } from "../config.ts";
import {
  loadOcrOutputForTranslate,
  loadTranslationOutput,
  resolveTranslatedOutputFile,
  saveTranslationOutput,
  translateAll,
} from "../api/services/translate-processing.ts";
import { parseCliArgs } from "./cli-utils.ts";

const main = async () => {
  const { logger, scope, pageNumber, flags } = parseCliArgs({
    name: "translate",
    description: "Translate OCR'd comic text using a local Ollama model",
    flags: [{ key: "--lang", description: "Target language", default: defaultTranslateTargetLanguage }],
  });

  const targetLanguage = flags["--lang"] ?? defaultTranslateTargetLanguage;

  const ocrOutput = loadOcrOutputForTranslate(scope);
  if (!ocrOutput) {
    logger.error(`No OCR output found for scope "${scope}". Run OCR first.`);
    process.exit(1);
  }

  if (pageNumber !== undefined && !ocrOutput.pages.some((p) => p.pageNumber === pageNumber)) {
    logger.error(`Page ${pageNumber} not found. Available: ${ocrOutput.pages.map((p) => p.pageNumber).join(", ")}`);
    process.exit(1);
  }

  const outputFile = resolveTranslatedOutputFile(scope);
  const totalLines = ocrOutput.pages.reduce((s, p) => s + p.lines.length, 0);
  logger.info(`Scope: ${scope}`);
  logger.info(`Target language: ${targetLanguage}`);
  logger.info(`Pages: ${ocrOutput.pages.length} / Lines: ${totalLines}`);
  if (pageNumber !== undefined) {
    logger.info(`Will update only page ${pageNumber} in output`);
  }
  logger.info(`Output: ${outputFile}\n`);

  // Load existing output — for single-page re-translate, this is the base to merge into
  const existing = loadTranslationOutput(scope) ?? [];
  const outputMap = new Map(existing.map((p) => [p.pageNumber, p]));

  const startedAt = Date.now();
  let successCount = 0;

  await translateAll(ocrOutput.pages, targetLanguage, (translated) => {
    // Skip pages we don't want to update in single-page mode
    if (pageNumber !== undefined && translated.pageNumber !== pageNumber) return;

    outputMap.set(translated.pageNumber, translated);
    successCount++;

    // Save incrementally after every completed page
    const merged = ocrOutput.pages
      .map((p) => outputMap.get(p.pageNumber))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    saveTranslationOutput(scope, merged);

    logger.info(`Page ${translated.pageNumber}: ${translated.lines.length} line(s) translated (${successCount} done)`);
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (pageNumber !== undefined) {
    logger.info(`\nComplete: updated page ${pageNumber} in ${elapsed}s`);
  } else {
    logger.info(`\nComplete: ${successCount}/${ocrOutput.pages.length} page(s) in ${elapsed}s`);
  }
  logger.info(`Output: ${outputFile}`);
};

main().catch((error) => {
  getLogger("translate").error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
