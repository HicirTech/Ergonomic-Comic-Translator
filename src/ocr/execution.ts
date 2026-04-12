import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { getLogger } from "../logger.ts";
import { runPaddlePythonOcr } from "../scripts/python-run.ts";
import type { OcrModel } from "./config";
import type { CompletedOcrJob, OcrOutput, OcrPage, PreparedOcrJob } from "./interfaces";
import { ocrRuntimeConfig, projectRoot, sourceName } from "./runtime-context.ts";
import { countOutputLines, ensureDirectory, formatDuration, readOcrOutput } from "./utils";

/**
 * Maps batch output pages back to their corresponding prepared jobs.
 */
const mapOutputToJobs = (
  jobs: PreparedOcrJob[],
  batchOutput: OcrOutput,
): CompletedOcrJob[] => {
  const results: CompletedOcrJob[] = [];
  let outputPageCursor = 0;

  for (const job of jobs) {
    const jobPages: OcrPage[] = [];

    while (
      outputPageCursor < batchOutput.pages.length &&
      batchOutput.pages[outputPageCursor].filePath === job.inputPath
    ) {
      jobPages.push(batchOutput.pages[outputPageCursor]);
      outputPageCursor += 1;
    }

    // Positional fallback if filePath doesn't match (absolute-vs-relative mismatch).
    if (jobPages.length === 0 && outputPageCursor < batchOutput.pages.length) {
      jobPages.push(batchOutput.pages[outputPageCursor]);
      outputPageCursor += 1;
    }

    const renumberedPages = jobPages.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
      lines: page.lines.map((line, lineIdx) => ({ ...line, lineIndex: lineIdx })),
    }));

    results.push({
      job,
      output: {
        source: batchOutput.source,
        ocrEngine: batchOutput.ocrEngine,
        ocrModel: batchOutput.ocrModel,
        language: batchOutput.language,
        device: batchOutput.device,
        generatedAt: batchOutput.generatedAt,
        pageCount: renumberedPages.length,
        pages: renumberedPages,
      },
    });
  }

  return results;
};

/**
 * Run a single batch of OCR jobs in one Python process on a specific device.
 */
const runOneBatch = async (
  jobs: PreparedOcrJob[],
  artifactsDir: string,
  batchIndex: number,
  batchCount: number,
  device: string,
  modelOverride?: OcrModel,
  languageOverride?: string,
  onProgress?: (pagesCompleted: number, pagesTotal: number) => void,
): Promise<CompletedOcrJob[]> => {
  const logger = getLogger("batch");
  if (jobs.length === 0) {
    return [];
  }

  const batchId = randomUUID();
  const tempInputFile = resolve(artifactsDir, `comictranslator-ocr-batch-${batchIndex}-${batchId}.json`);
  const tempOutputFile = resolve(artifactsDir, `comictranslator-ocr-batch-output-${batchIndex}-${batchId}.json`);
  ensureDirectory(tempInputFile);

  const inputPaths = jobs.map((job) => job.inputPath);
  writeFileSync(tempInputFile, JSON.stringify(inputPaths, null, 2), "utf8");

  const label = batchCount > 1
    ? `[batch ${batchIndex + 1}/${batchCount} on ${device}]`
    : "[batch]";

  logger.info(`${label} Starting OCR for ${jobs.length} page(s) in a single pipeline invocation.`);
  const startedAt = Date.now();

  await runPaddlePythonOcr(
    {
      projectRoot,
      inputFile: tempInputFile,
      outputFile: tempOutputFile,
      lang: languageOverride ?? ocrRuntimeConfig.language,
      model: modelOverride ?? ocrRuntimeConfig.model,
      device,
      source: sourceName,
    },
    onProgress,
  );

  const batchOutput = readOcrOutput(tempOutputFile);
  const elapsed = formatDuration(Date.now() - startedAt);
  logger.info(
    `${label} Completed: ${batchOutput.pageCount} page(s), ${countOutputLines(batchOutput)} line(s) in ${elapsed}.`,
  );

  return mapOutputToJobs(jobs, batchOutput);
};

/**
 * Resolve the device list for parallel batch execution.
 *
 * Rules:
 * - `maxBatches <= 1`: always single process.
 * - Explicit device ("gpu:0", "cpu", …): repeat it `maxBatches` times so
 *   multiple processes can share the same physical device.
 * - `device === "auto"`: detect GPU count via `nvidia-smi`, then assign
 *   devices round-robin — e.g. 1 GPU + 2 batches → ["gpu:0", "gpu:0"],
 *   2 GPUs + 4 batches → ["gpu:0", "gpu:1", "gpu:0", "gpu:1"].
 *   Falls back to "auto" repeated on detection failure.
 */
const resolveDevicesForBatches = async (device: string, maxBatches: number): Promise<string[]> => {
  if (maxBatches <= 1) {
    return [device];
  }

  // Explicit device — just repeat it
  if (device !== "auto") {
    return Array.from({ length: maxBatches }, () => device);
  }

  // Auto-detect GPU count
  try {
    const { $ } = await import("bun");
    const result = await $`nvidia-smi --query-gpu=name --format=csv,noheader`.nothrow().quiet();
    if (result.exitCode !== 0) {
      return Array.from({ length: maxBatches }, () => "auto");
    }

    const gpuCount = (result.stdout ? Buffer.from(result.stdout).toString("utf8") : "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0).length;

    if (gpuCount === 0) {
      // No NVIDIA GPU — all processes share CPU
      return Array.from({ length: maxBatches }, () => "cpu");
    }

    // Round-robin across gpuCount GPUs; if maxBatches > gpuCount the same
    // GPU index appears multiple times (intra-device parallelism).
    return Array.from({ length: maxBatches }, (_, i) => `gpu:${i % gpuCount}`);
  } catch (error) {
    getLogger("batch").warn(`GPU auto-detection failed: ${error instanceof Error ? error.message : "unknown"}. Falling back to 'auto'.`);
    return Array.from({ length: maxBatches }, () => "auto");
  }
};

/**
 * Run OCR jobs across one or more GPU batches.
 *
 * - With 1 device (single GPU or CPU): all jobs run in a single Python process.
 * - With N devices (multi-GPU): jobs are split round-robin across N parallel
 *   Python processes, each pinned to a different GPU. This gives N model loads
 *   instead of 1, but true GPU parallelism outweighs the extra load time.
 */
export const runBatchOcrJobs = async (
  jobs: PreparedOcrJob[],
  artifactsDir: string,
  modelOverride?: OcrModel,
  languageOverride?: string,
  onProgress?: (pagesCompleted: number, pagesTotal: number) => void,
): Promise<CompletedOcrJob[]> => {
  if (jobs.length === 0) {
    return [];
  }

  const devices = await resolveDevicesForBatches(ocrRuntimeConfig.device, ocrRuntimeConfig.concurrency);
  const batchCount = Math.min(devices.length, jobs.length);

  if (batchCount <= 1) {
    // Single batch — one process, one model load
    return runOneBatch(jobs, artifactsDir, 0, 1, devices[0], modelOverride, languageOverride, onProgress);
  }

  // Split jobs round-robin across parallel batches
  const batches: PreparedOcrJob[][] = Array.from({ length: batchCount }, () => []);
  for (let i = 0; i < jobs.length; i++) {
    batches[i % batchCount].push(jobs[i]);
  }

  // Summarise: e.g. "gpu:0 ×2" for same-GPU parallelism, "gpu:0, gpu:1" for multi-GPU
  const deviceSummary = [...new Set(devices.slice(0, batchCount))]
    .map((d) => {
      const n = devices.slice(0, batchCount).filter((x) => x === d).length;
      return n > 1 ? `${d} ×${n}` : d;
    })
    .join(", ");
  getLogger("batch").info(
    `[parallel] Splitting ${jobs.length} page(s) across ${batchCount} worker(s): ${deviceSummary}`,
  );

  // Track each batch's completed-page count independently, then sum.
  // batchProgress[i] holds the number of pages *completed* in batch i:
  //   - incremented to (pageCurrent - 1) when a new page starts (pageCurrent is 1-based)
  //   - set to batchJobs.length once the batch process exits
  // This ensures the aggregate only reaches totalPages after ALL batches finish.
  const batchProgress = Array<number>(batchCount).fill(0);
  const totalPages = jobs.length;

  const batchResults = await Promise.all(
    batches.map((batchJobs, batchIndex) =>
      runOneBatch(
        batchJobs,
        artifactsDir,
        batchIndex,
        batchCount,
        devices[batchIndex],
        modelOverride,
        languageOverride,
        onProgress
          ? (pageCurrent) => {
              // A new page is starting; pageCurrent - 1 pages are done in this batch.
              batchProgress[batchIndex] = pageCurrent - 1;
              onProgress(batchProgress.reduce((s, v) => s + v, 0), totalPages);
            }
          : undefined,
      ).then((result) => {
        // Batch fully done — mark all its pages as completed and emit a final update.
        if (onProgress) {
          batchProgress[batchIndex] = batchJobs.length;
          onProgress(batchProgress.reduce((s, v) => s + v, 0), totalPages);
        }
        return result;
      }),
    ),
  );

  // Reassemble results in original job order
  const resultsByInputPath = new Map<string, CompletedOcrJob>();
  for (const batchResult of batchResults) {
    for (const result of batchResult) {
      resultsByInputPath.set(result.job.inputPath, result);
    }
  }

  return jobs.map((job) => resultsByInputPath.get(job.inputPath)!);
};
