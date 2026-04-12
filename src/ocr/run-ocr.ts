import { existsSync, readFileSync, writeFileSync } from "fs";
import { runBatchOcrJobs } from "./execution.ts";
import { getLogger } from "../logger.ts";
import {
  defaultOutputScope,
  inputDir,
  ocrRuntimeConfig,
  resolveOutputFileForScope,
  resolveOutputScopeForInput,
  resolvePrepareDirForScope,
} from "./runtime-context.ts";
import { mergeOcrOutputs } from "./merge.ts";
import { loadOcrPrepareManifest, prepareOcrInputs } from "./preparation.ts";
import { collectInputFiles, ensureDirectory } from "./utils";
import type { OcrOutput, OcrPage, PreparedOcrJob } from "./interfaces";
import type { OcrModel } from "./config";
import type { CompletedOcrJob } from "./interfaces";

/** Merge batch results, write the combined output JSON, and return the output file path. */
const mergeAndWriteOcrOutput = (results: CompletedOcrJob[], outputScope: string): string => {
  const logger = getLogger("ocr");
  const totalPages = results.reduce((sum, r) => sum + r.output.pageCount, 0);
  logger.info(`Combining ${results.length} completed OCR job(s) into ${totalPages} page(s).`);

  const mergedOutput = mergeOcrOutputs(results);
  const outputFile = resolveOutputFileForScope(outputScope);
  ensureDirectory(outputFile);
  writeFileSync(outputFile, JSON.stringify(mergedOutput, null, 2), "utf8");
  logger.info(`OCR JSON output saved for scope ${outputScope}: ${outputFile}`);
  return outputFile;
};

const groupInputPathsByOutputScope = (inputPaths: string[]) => {
  const groupedInputPaths = new Map<string, string[]>();

  for (const inputPath of inputPaths) {
    const outputScope = resolveOutputScopeForInput(inputPath);
    const existingPaths = groupedInputPaths.get(outputScope) ?? [];
    existingPaths.push(inputPath);
    groupedInputPaths.set(outputScope, existingPaths);
  }

  return groupedInputPaths;
};

/**
 * Re-run OCR on a single page (by 1-based page number) within an existing scope.
 *
 * - If an OCR output JSON already exists, the page's `lines` entry is patched in place.
 * - If no OCR output exists yet, a new output is bootstrapped from the prepare manifest:
 *   all pages are created with empty `lines`, and only the requested page is actually OCR'd.
 */
export const runOcrForSinglePage = async (outputScope: string, pageNumber: number, model?: OcrModel, language?: string): Promise<{ outputFile: string; linesFound: number }> => {
  const outputFile = resolveOutputFileForScope(outputScope);
  const prepareDir = resolvePrepareDirForScope(outputScope);
  const logger = getLogger("ocr");

  if (!existsSync(outputFile)) {
    // No OCR output yet — bootstrap from the prepare manifest
    const manifest = loadOcrPrepareManifest(prepareDir);
    if (!manifest || manifest.length === 0) {
      throw new Error(
        `No OCR output and no prepare manifest found for scope "${outputScope}". ` +
        `Run full OCR first or ensure the upload was prepared correctly.`,
      );
    }

    const sortedJobs = [...manifest].sort((a, b) =>
      a.sourceIndex !== b.sourceIndex ? a.sourceIndex - b.sourceIndex : a.sourcePageNumber - b.sourcePageNumber,
    );

    const targetJob = sortedJobs[pageNumber - 1];
    if (!targetJob) {
      throw new Error(
        `Page ${pageNumber} is out of range for scope "${outputScope}". ` +
        `Manifest contains ${sortedJobs.length} page(s).`,
      );
    }

    if (!existsSync(targetJob.inputPath)) {
      throw new Error(`Prepared image for page ${pageNumber} not found: ${targetJob.inputPath}`);
    }

    const { jobs } = await prepareOcrInputs([targetJob.inputPath], prepareDir);
    if (jobs.length === 0) {
      throw new Error(`No OCR jobs prepared for page ${pageNumber}.`);
    }

    const results = await runBatchOcrJobs(jobs, prepareDir, model, language);
    if (results.length === 0 || results[0].output.pages.length === 0) {
      throw new Error(`OCR produced no output for page ${pageNumber}.`);
    }

    const ocrResult = results[0].output;
    const newLines = ocrResult.pages[0].lines;

    // Build a full-framework OcrOutput: all pages from manifest, only the target page OCR'd
    const allPages: OcrPage[] = sortedJobs.map((job, idx) => ({
      pageNumber: idx + 1,
      fileName: job.sourceFileName,
      filePath: job.inputPath,
      lines: idx + 1 === pageNumber ? newLines : [],
    }));

    const newOutput: OcrOutput = {
      source: outputScope,
      ocrEngine: ocrResult.ocrEngine,
      ocrModel: ocrResult.ocrModel,
      language: ocrResult.language,
      device: ocrResult.device,
      generatedAt: new Date().toISOString(),
      pageCount: allPages.length,
      pages: allPages,
    };

    ensureDirectory(outputFile);
    writeFileSync(outputFile, JSON.stringify(newOutput, null, 2), "utf8");
    logger.info(
      `Created OCR output for scope "${outputScope}" ` +
      `(${allPages.length} page(s) total, page ${pageNumber} OCR'd — ${newLines.length} line(s) found).`,
    );
    return { outputFile, linesFound: newLines.length };
  }

  // Existing OCR file — patch just the target page
  const existing = JSON.parse(readFileSync(outputFile, "utf8")) as OcrOutput;
  const targetPage = existing.pages.find((p) => p.pageNumber === pageNumber);
  if (!targetPage) {
    throw new Error(`Page ${pageNumber} not found in scope "${outputScope}". Available: ${existing.pages.map((p) => p.pageNumber).join(", ")}`);
  }

  if (!existsSync(targetPage.filePath)) {
    throw new Error(`Prepared image for page ${pageNumber} not found: ${targetPage.filePath}`);
  }

  const { jobs } = await prepareOcrInputs([targetPage.filePath], prepareDir);
  if (jobs.length === 0) {
    throw new Error(`No OCR jobs prepared for page ${pageNumber}.`);
  }

  const results = await runBatchOcrJobs(jobs, prepareDir, model, language);
  if (results.length === 0 || results[0].output.pages.length === 0) {
    throw new Error(`OCR produced no output for page ${pageNumber}.`);
  }

  const newLines = results[0].output.pages[0].lines;
  const updatedPages = existing.pages.map((p) =>
    p.pageNumber === pageNumber ? { ...p, lines: newLines } : p,
  );

  const updated: OcrOutput = {
    ...existing,
    generatedAt: new Date().toISOString(),
    pages: updatedPages,
  };

  writeFileSync(outputFile, JSON.stringify(updated, null, 2), "utf8");
  logger.info(`Patched page ${pageNumber} in ${outputFile} — ${newLines.length} line(s) found.`);
  return { outputFile, linesFound: newLines.length };
};

export const runOcrForPreparedJobs = async (
  jobs: PreparedOcrJob[],
  prepareDir: string,
  outputScope: string,
  model?: OcrModel,
  language?: string,
  onProgress?: (pagesCompleted: number, pagesTotal: number) => void,
) => {
  if (jobs.length === 0) {
    throw new Error("No prepared OCR jobs provided.");
  }

  const logger = getLogger("ocr");
  const results = await runBatchOcrJobs(jobs, prepareDir, model, language, onProgress);
  const outputFile = mergeAndWriteOcrOutput(results, outputScope);
  logger.info(`OCR prepared files preserved under ${prepareDir}`);
  return outputFile;
};

export const runOcrForInputPaths = async (
  inputPaths: string[],
  outputScope: string,
  model?: OcrModel,
  language?: string,
  onProgress?: (pagesCompleted: number, pagesTotal: number) => void,
) => {
  const logger = getLogger("ocr");
  const prepareDir = resolvePrepareDirForScope(outputScope);
  const { jobs } = await prepareOcrInputs(inputPaths, prepareDir);
  if (jobs.length === 0) {
    throw new Error("No OCR jobs were prepared from the provided inputs.");
  }

  const results = await runBatchOcrJobs(jobs, prepareDir, model, language, onProgress);
  const outputFile = mergeAndWriteOcrOutput(results, outputScope);
  logger.info(`OCR prepared files preserved under ${prepareDir}`);
  return outputFile;
};

export const runOcrCli = async () => {
  const logger = getLogger("ocr");
  logger.info(`Starting OCR scan for configured input directory: ${inputDir}`);
  logger.info(`Using OCR runtime config: ${JSON.stringify(ocrRuntimeConfig)}`);

  const files = collectInputFiles(inputDir);
  if (files.length === 0) {
    logger.error(`No supported input files found in ${inputDir}. Add PDF or supported image files to the configured input directory.`);
    process.exit(1);
  }

  const groupedInputPaths = groupInputPathsByOutputScope(files);
  logger.info(`Resolved ${groupedInputPaths.size} OCR output scope(s). Direct OCR output uses scope ${defaultOutputScope}.`);
  for (const [outputScope, scopedInputPaths] of groupedInputPaths.entries()) {
    logger.info(`Starting OCR for scope ${outputScope} with ${scopedInputPaths.length} input file(s).`);
    await runOcrForInputPaths(scopedInputPaths, outputScope);
  }
};
