import { $ } from "bun";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { forwardPythonLine, forwardPythonLogs, getLogger } from "../logger.ts";
import {
  ocrSourceName,
  projectRoot as defaultProjectRoot,
  textCleanerPython,
  textCleanerVenvDir,
  textCleanerInpaintingSize,
  textCleanerMaskDilation,
  textCleanerPasses,
  textCleanerDevice,
  memoryEnabled,
  memoryPython,
  memoryVenvDir,
  ollamaHost,
  ollamaTranslateModel,
  ollamaEmbedModel,
  qdrantStoragePath,
} from "../config.ts";
import type { OcrModel } from "../ocr/config";
import { getZludaLibraryPath } from "./amd-detect.ts";
import { detectPythonLayer, type PythonLayerDetection } from "./python-detect.ts";
import { decodeBuffer } from "./shell-utils.ts";

export interface PythonRunOptions {
  projectRoot?: string;
  inputFile: string;
  outputFile: string;
  lang: string;
  model: OcrModel;
  device?: string;
  source?: string;
}

export interface PdfSplitPage {
  pageIndex: number;
  pageNumber: number;
  pageCount: number;
  imagePath: string;
}

export interface PdfSplitManifest {
  sourcePath: string;
  pageCount: number;
  pages: PdfSplitPage[];
}

export interface PdfSplitOptions {
  projectRoot?: string;
  inputFile: string;
  outputFile: string;
  imageDir: string;
  prefix?: string;
}

const cachedPythonLayerDetection = new Map<string, Promise<PythonLayerDetection>>();

/**
 * Read a ReadableStream<Uint8Array> line by line, calling onLine for each non-empty trimmed line.
 * Handles partial lines across chunks correctly.
 */
const readStreamLines = async (
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      const last = buffer.trim();
      if (last) onLine(last);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onLine(line);
      idx = buffer.indexOf("\n");
    }
  }
};

/** Drain a ReadableStream<Uint8Array> fully and return the collected text. */
const drainStream = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
};

const ensurePythonLayerReady = async (projectRoot: string) => {
  const cachedDetection = cachedPythonLayerDetection.get(projectRoot) ?? detectPythonLayer({ projectRoot });
  cachedPythonLayerDetection.set(projectRoot, cachedDetection);
  const detection = await cachedDetection;
  if (!detection.poetryAvailable || !detection.environmentReady || !detection.paddleInstalled || !detection.paddleOcrInstalled) {
    throw new Error("Python layer is not ready. Run `bun run python:bootstrap` first.");
  }
};

let cachedZludaPath: string | null | undefined;

const resolveZludaEnv = async (): Promise<Record<string, string>> => {
  if (cachedZludaPath === undefined) {
    cachedZludaPath = await getZludaLibraryPath();
  }

  if (!cachedZludaPath) {
    return {};
  }

  const existingLdPath = process.env.LD_LIBRARY_PATH ?? "";
  return {
    LD_LIBRARY_PATH: existingLdPath ? `${cachedZludaPath}:${existingLdPath}` : cachedZludaPath,
  };
};

const pythonSrcDir = (projectRoot: string) => resolve(projectRoot, "src", "python");

const runPoetryPythonScript = async (
  projectRoot: string,
  moduleName: string,
  args: string[],
  failurePrefix: string,
  onLine?: (line: string) => void,
): Promise<string> => {
  const zludaEnv = await resolveZludaEnv();
  const logger = getLogger("python");

  const proc = Bun.spawn(["poetry", "run", "python", "-m", moduleName, ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...zludaEnv, PYTHONPATH: pythonSrcDir(projectRoot) },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Consume stdout and stderr concurrently to prevent pipe-buffer deadlocks.
  // stderr is forwarded line-by-line to the logger (and optionally to onLine).
  const [, stdout] = await Promise.all([
    readStreamLines(proc.stderr, (line) => {
      forwardPythonLine(logger, line);
      onLine?.(line);
    }),
    drainStream(proc.stdout),
    proc.exited,
  ]);

  if (proc.exitCode !== 0) {
    throw new Error(`${failurePrefix} failed with exit code ${proc.exitCode}`);
  }

  return stdout.trim();
};

export const runPaddlePythonOcr = async (
  options: PythonRunOptions,
  onProgress?: (current: number, total: number) => void,
) => {
  const projectRoot = options.projectRoot ?? defaultProjectRoot;

  await ensurePythonLayerReady(projectRoot);

  return runPoetryPythonScript(
    projectRoot,
    "ocr.runner",
    [
      "--input",
      options.inputFile,
      "--output",
      options.outputFile,
      "--lang",
      options.lang,
      "--model",
      options.model,
      "--device",
      options.device ?? "auto",
      "--source",
      options.source ?? ocrSourceName,
    ],
    "PaddleOCR Poetry run",
    onProgress
      ? (line) => {
          const match = /\[INFO\] Processing page (\d+)\/(\d+)/.exec(line);
          if (match) onProgress(parseInt(match[1], 10), parseInt(match[2], 10));
        }
      : undefined,
  );
};

export const splitPdfToImages = async (options: PdfSplitOptions): Promise<PdfSplitManifest> => {
  const projectRoot = options.projectRoot ?? defaultProjectRoot;

  await ensurePythonLayerReady(projectRoot);

  await runPoetryPythonScript(
    projectRoot,
    "ocr.pdf",
    ["--input", options.inputFile, "--output", options.outputFile, "--image-dir", options.imageDir, ...(options.prefix ? ["--prefix", options.prefix] : [])],
    "PDF page render",
  );

  return JSON.parse(readFileSync(options.outputFile, "utf8")) as PdfSplitManifest;
};

// --- Text Cleaner (local textless Python pipeline) ---

export interface TextCleanerOptions {
  imagePath: string;
  ocrJsonPath: string;
  pageNumber: number;
  outputPath: string;
  device?: string;
  inpaintingSize?: number;
  maskDilation?: number;
  passes?: number;
}

export interface TextCleanerResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

const runTextCleanerPython = async (args: string[], failurePrefix: string) => {
  const python = textCleanerPython;
  const logger = getLogger("python");

  if (!existsSync(python)) {
    throw new Error(`Text cleaner Python not found at ${python}. Run \`bun run text-cleaner:bootstrap\` first.`);
  }

  const result = await $`${python} -m textless.runner ${args}`
    .env({ ...process.env, PYTHONPATH: pythonSrcDir(defaultProjectRoot) })
    .nothrow();

  const stderr = decodeBuffer(result.stderr).trim();
  if (result.exitCode !== 0) {
    if (stderr) forwardPythonLogs(logger, stderr);
    throw new Error(`${failurePrefix} failed with exit code ${result.exitCode}`);
  }

  if (stderr) forwardPythonLogs(logger, stderr);

  return decodeBuffer(result.stdout).trim();
};

export const runTextCleaner = async (options: TextCleanerOptions): Promise<TextCleanerResult> => {
  if (!existsSync(textCleanerVenvDir)) {
    throw new Error(`Text cleaner venv not found at ${textCleanerVenvDir}. Run \`bun run text-cleaner:bootstrap\` first.`);
  }

  const args = [
    "--image", options.imagePath,
    "--ocr-json", options.ocrJsonPath,
    "--page-number", String(options.pageNumber),
    "--output", options.outputPath,
    "--device", options.device ?? textCleanerDevice,
    "--inpainting-size", String(options.inpaintingSize ?? textCleanerInpaintingSize),
    "--mask-dilation-offset", String(options.maskDilation ?? textCleanerMaskDilation),
    "--passes", String(options.passes ?? textCleanerPasses),
  ];

  const stdout = await runTextCleanerPython(args, "Text cleaner");

  // The last line of stdout should be a JSON result
  const lines = stdout.split("\n").filter(Boolean);
  const lastLine = lines[lines.length - 1];

  try {
    return JSON.parse(lastLine) as TextCleanerResult;
  } catch {
    // If we can't parse JSON, treat the full output as diagnostic info
    return { success: false, error: `Unexpected output from text cleaner:\n${stdout}` };
  }
};

// --- Memory (Mem0 + local Qdrant + Ollama) ---

/**
 * Run a memory CLI command and return the parsed JSON result.
 *
 * Returns `null` when memory is disabled or the venv is not yet installed.
 * All errors are logged as warnings rather than thrown so that memory failures
 * never interrupt the main translation pipeline.
 *
 * @param args  CLI arguments, e.g. ["add", "--content", "..."]
 */
export const runMemoryCli = async (args: string[]): Promise<unknown> => {
  if (!memoryEnabled) {
    return null;
  }

  const python = memoryPython;
  const logger = getLogger("memory");

  if (!existsSync(python)) {
    logger.warn(`Memory venv not found at ${memoryVenvDir}. Run \`bun run memory:bootstrap\` to enable persistent memory.`);
    return null;
  }

  const pythonSrc = resolve(defaultProjectRoot, "src", "python");

  try {
    const result = await $`${python} -m memory.cli ${args}`
      .env({
        ...process.env,
        PYTHONPATH: pythonSrc,
        OLLAMA_HOST: ollamaHost,
        OLLAMA_TRANSLATE_MODEL: ollamaTranslateModel,
        OLLAMA_EMBED_MODEL: ollamaEmbedModel,
        QDRANT_STORAGE_PATH: qdrantStoragePath,
      })
      .nothrow();

    const stderr = decodeBuffer(result.stderr).trim();
    if (stderr) forwardPythonLogs(logger, stderr);

    if (result.exitCode !== 0) {
      logger.warn(`Memory CLI exited with code ${result.exitCode}. Memory operation skipped.`);
      return null;
    }

    const stdout = decodeBuffer(result.stdout).trim();
    if (!stdout) return null;

    try {
      return JSON.parse(stdout) as unknown;
    } catch {
      logger.warn(`Memory CLI returned non-JSON output: ${stdout.slice(0, 200)}. Memory operation skipped.`);
      return null;
    }
  } catch (err) {
    logger.warn(`Memory CLI error: ${err instanceof Error ? err.message : String(err)}. Memory operation skipped.`);
    return null;
  }
};