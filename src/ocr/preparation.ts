import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { basename, parse, resolve } from "path";
import { getLogger } from "../logger.ts";
import { splitPdfToImages, type PdfSplitManifest } from "../scripts/python-run.ts";
import type { PreparedOcrInputs, PreparedOcrJob } from "./interfaces";
import { ocrRuntimeConfig, projectRoot } from "./runtime-context.ts";
import { ensureDirectory, isPdfInput } from "./utils";

const IMAGES_SUBDIR = "images";

const safePdfPrefix = (inputPath: string): string => {
  const stem = parse(inputPath).name;
  return stem.replace(/[^a-zA-Z0-9_-]/g, "_") || "pdf";
};

const preparePdfJobs = async (
  inputPath: string,
  sourceIndex: number,
  prepareDir: string,
): Promise<{ jobs: PreparedOcrJob[] }> => {
  const logger = getLogger("prepare");
  const splitManifestFile = resolve(prepareDir, `comictranslator-pdf-split-${crypto.randomUUID()}.json`);
  const imagesDir = resolve(prepareDir, IMAGES_SUBDIR);
  ensureDirectory(splitManifestFile);

  const prefix = safePdfPrefix(inputPath);

  logger.info(`Splitting PDF ${sourceIndex + 1}: ${basename(inputPath)}`);
  const manifest: PdfSplitManifest = await splitPdfToImages({
    projectRoot,
    inputFile: inputPath,
    outputFile: splitManifestFile,
    imageDir: imagesDir,
    prefix,
  });

  logger.info(`Split ${basename(inputPath)} into ${manifest.pageCount} page job(s).`);

  return {
    jobs: manifest.pages.map((page) => ({
      inputPath: page.imagePath,
      artifactsDir: prepareDir,
      sourcePath: inputPath,
      sourceFileName: basename(inputPath),
      sourceIndex,
      sourcePageNumber: page.pageNumber,
      sourcePageCount: page.pageCount,
      sourceType: "pdf",
    })),
  };
};

const copyImageToPrep = (inputPath: string, prepareDir: string): string => {
  const destPath = resolve(prepareDir, IMAGES_SUBDIR, basename(inputPath));
  ensureDirectory(destPath);
  copyFileSync(inputPath, destPath);
  return destPath;
};

export const prepareOcrInputs = async (inputPaths: string[], prepareDir: string): Promise<PreparedOcrInputs> => {
  const logger = getLogger("prepare");
  const jobs: PreparedOcrJob[] = [];
  logger.info(`Found ${inputPaths.length} input file(s).`);

  for (const [sourceIndex, inputPath] of inputPaths.entries()) {
    if (isPdfInput(inputPath)) {
      const preparedPdf = await preparePdfJobs(inputPath, sourceIndex, prepareDir);
      jobs.push(...preparedPdf.jobs);
      continue;
    }

    const preparedPath = copyImageToPrep(inputPath, prepareDir);
    logger.info(`Copied image ${sourceIndex + 1}: ${basename(inputPath)}`);
    jobs.push({
      inputPath: preparedPath,
      artifactsDir: prepareDir,
      sourcePath: inputPath,
      sourceFileName: basename(inputPath),
      sourceIndex,
      sourcePageNumber: 1,
      sourcePageCount: 1,
      sourceType: "image",
    });
  }

  logger.info(`Prepared ${jobs.length} OCR job(s) with concurrency ${Math.min(ocrRuntimeConfig.concurrency, jobs.length)}.`);
  return { jobs };
};

const PREPARE_MANIFEST_FILENAME = "prepared-manifest.json";

export const saveOcrPrepareManifest = (jobs: PreparedOcrJob[], prepareDir: string): void => {
  const manifestPath = resolve(prepareDir, PREPARE_MANIFEST_FILENAME);
  ensureDirectory(manifestPath);
  writeFileSync(manifestPath, JSON.stringify(jobs, null, 2), "utf8");
};

export const loadOcrPrepareManifest = (prepareDir: string): PreparedOcrJob[] | null => {
  const manifestPath = resolve(prepareDir, PREPARE_MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as PreparedOcrJob[];
  } catch (error) {
    getLogger("prepare").warn(`Failed to parse prepare manifest at ${manifestPath}: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
};
