/**
 * Context/Glossary detection script — detects proper nouns from OCR text using AI.
 *
 * Usage:
 *   bun run context {uploadId} [page]
 *
 *   uploadId — the upload scope to analyse
 *   page     — optional 1-based page number; omit to analyse all pages
 */
import { getLogger } from "../logger.ts";
import {
  detectContextTerms,
  loadOcrOutputForContext,
  resolveContextFile,
} from "../api/services/context-processing.ts";
import { parseCliArgs } from "./cli-utils.ts";

const main = async () => {
  const { logger, scope, pageNumber } = parseCliArgs({
    name: "context",
    description: "Detect proper nouns and untranslatable terms from OCR text",
  });

  const pageNumbers = pageNumber !== undefined ? [pageNumber] : null;

  const ocrOutput = loadOcrOutputForContext(scope);
  if (!ocrOutput) {
    logger.error(`No OCR output found for scope "${scope}". Run OCR first.`);
    process.exit(1);
  }

  const targetPages = pageNumbers !== null
    ? ocrOutput.pages.filter((p) => pageNumbers.includes(p.pageNumber))
    : ocrOutput.pages;

  if (pageNumbers !== null && targetPages.length === 0) {
    logger.error(`Page(s) ${pageNumbers.join(", ")} not found. Available: ${ocrOutput.pages.map((p) => p.pageNumber).join(", ")}`);
    process.exit(1);
  }

  const outputFile = resolveContextFile(scope);
  logger.info(`Scope: ${scope}`);
  logger.info(`Pages: ${pageNumbers !== null ? pageNumbers.join(", ") : `all (${ocrOutput.pages.length})`}`);
  logger.info(`Output: ${outputFile}\n`);

  logger.info("Detecting proper nouns and untranslatable terms...");
  const startedAt = Date.now();

  const terms = await detectContextTerms(scope, pageNumbers);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`\nDetected ${terms.length} term(s) in ${elapsed}s`);
  if (terms.length > 0) {
    logger.info("Terms:");
    for (const t of terms) {
      const contextNote = t.context ? ` → ${t.context}` : "";
      logger.info(`  - ${t.term}${contextNote}`);
    }
  }
  logger.info(`Output: ${outputFile}`);
};

main().catch((error) => {
  getLogger("context").error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
