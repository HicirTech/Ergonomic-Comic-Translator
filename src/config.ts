import { basename, isAbsolute, resolve } from "path";
import type { OcrRuntimeConfig } from "./ocr/interfaces/ocr-runtime-config.ts";
import { supportedOcrModels, type OcrModel } from "./ocr/config/ocr-model.ts";

const readStringEnv = (value: string | undefined, fallback: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

const parsePort = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid API_PORT: ${value}. Expected an integer between 1 and 65535.`);
  }

  return parsed;
};

const normalizeOcrModel = (value: string | undefined, fallback: OcrModel) => {
  if (!value) {
    return fallback;
  }

  const modelAliases: Record<string, OcrModel> = {
    paddleocr: "paddleocr",
    "paddleocr-vl": "paddleocr-vl-1.5",
    "paddleocr-vl-1.5": "paddleocr-vl-1.5",
  };

  const normalized = modelAliases[value.trim().toLowerCase()];
  if (normalized) {
    return normalized;
  }

  throw new Error(
    `Unsupported OCR model: ${value}. Supported values: ${supportedOcrModels.join(", ")}.`,
  );
};

const parsePositiveInteger = (value: string | undefined, fallback: number, envName: string) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid ${envName}: ${value}. Expected an integer >= 1.`);
  }

  return parsed;
};

const resolveConfiguredPath = (value: string | undefined, fallbackPath: string) => {
  const normalized = value?.trim();
  if (!normalized) {
    return fallbackPath;
  }

  return isAbsolute(normalized) ? resolve(normalized) : resolve(projectRoot, normalized);
};

export const projectRoot = process.cwd();

export const defaultTempDirectoryName = ".tmp";
export const defaultFilesDirectoryName = "ocr";
export const defaultProgramDirectoryName = "program";
export const defaultApiUploadsDirectoryName = "upload";
export const defaultOcrPrepareDirectoryName = "ocr_prepare";
export const defaultOcrOutputDirectoryName = "ocr_output";
export const defaultTextlessDirectoryName = "textless";
export const defaultUploadRecordFileName = "uploadRecord.json";
export const defaultOcrQueueFileName = "ocrQueue.json";
export const defaultTextlessQueueFileName = "textlessQueue.json";
export const defaultOcrOutputScopeName = "ocr";
export const defaultOcrOutputFileName = "ocr_output.json";

export const tempRootDir = resolveConfiguredPath(
  process.env.COMIC_TRANSLATOR_TEMP_DIR,
  resolve(projectRoot, defaultTempDirectoryName),
);

export const programDir = resolve(tempRootDir, defaultProgramDirectoryName);

export const filesRootDir = resolveConfiguredPath(
  process.env.COMIC_TRANSLATOR_FILES_DIR,
  resolve(tempRootDir, defaultFilesDirectoryName),
);
export const ocrPrepareRootDir = resolveConfiguredPath(
  process.env.OCR_PREPARE_DIR,
  resolve(tempRootDir, defaultOcrPrepareDirectoryName),
);
export const ocrOutputRootDir = resolveConfiguredPath(
  process.env.OCR_OUTPUT_DIR ?? process.env.OCR_OUTPUT_ROOT_DIR,
  resolve(tempRootDir, defaultOcrOutputDirectoryName),
);
export const textlessRootDir = resolveConfiguredPath(
  process.env.TEXTLESS_DIR,
  resolve(tempRootDir, defaultTextlessDirectoryName),
);
export const ocrOutputFileName = readStringEnv(process.env.OCR_OUTPUT_FILE_NAME, defaultOcrOutputFileName);
export const apiUploadsRootDir = resolveConfiguredPath(
  process.env.API_UPLOADS_DIR,
  resolve(tempRootDir, defaultApiUploadsDirectoryName),
);
export const uploadRecordsFile = resolveConfiguredPath(
  process.env.UPLOAD_RECORDS_FILE,
  resolve(programDir, defaultUploadRecordFileName),
);
export const ocrQueueFile = resolveConfiguredPath(
  process.env.OCR_QUEUE_FILE,
  resolve(programDir, defaultOcrQueueFileName),
);
export const textlessQueueFile = resolveConfiguredPath(
  process.env.TEXTLESS_QUEUE_FILE,
  resolve(programDir, defaultTextlessQueueFileName),
);
export const ocrSourceName = readStringEnv(
  process.env.OCR_SOURCE_NAME,
  basename(filesRootDir) || defaultFilesDirectoryName,
);

export const defaultApiHost = "0.0.0.0";
export const defaultApiPort = 3000;
export const apiHost = readStringEnv(process.env.API_HOST, defaultApiHost);
export const apiPort = parsePort(process.env.API_PORT, defaultApiPort);

export const defaultOcrModel: OcrModel = "paddleocr-vl-1.5";
export const defaultOcrLanguage = "japan";
export const defaultOcrDevice = "auto";
export const defaultOcrConcurrency = 2;

export const resolveOcrRuntimeConfig = (): OcrRuntimeConfig => ({
  model: normalizeOcrModel(process.env.OCR_MODEL, defaultOcrModel),
  language: readStringEnv(process.env.OCR_LANGUAGE, defaultOcrLanguage),
  device: readStringEnv(process.env.OCR_DEVICE, defaultOcrDevice),
  concurrency: parsePositiveInteger(process.env.OCR_CONCURRENCY, defaultOcrConcurrency, "OCR_CONCURRENCY"),
});

export const supportedImageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"] as const;
export const supportedDocumentExtensions = [".pdf"] as const;
export const supportedArchiveExtensions = [".zip"] as const;
export const supportedOcrInputExtensions = [...supportedImageExtensions, ...supportedDocumentExtensions] as const;
export const supportedUploadExtensions = [...supportedOcrInputExtensions, ...supportedArchiveExtensions] as const;
export const supportedArchiveExtractExtensions = [
  ...supportedImageExtensions,
  ...supportedDocumentExtensions,
] as const;

// ── API routes ────────────────────────────────────────────────────────────────

export const apiRoutes = {
  config: "/api/config",
  context: "/api/context",
  files: "/api/files",
  ocr: "/api/ocr",
  textless: "/api/textless",
  translate: "/api/translate",
  upload: "/api/upload",
  health: "/health",
} as const;

export const defaultTranslatedDirectoryName = "translated";
export const defaultTranslateQueueFileName = "translateQueue.json";

export const translatedRootDir = resolveConfiguredPath(
  process.env.TRANSLATED_DIR,
  resolve(tempRootDir, defaultTranslatedDirectoryName),
);
export const translateQueueFile = resolveConfiguredPath(
  process.env.TRANSLATE_QUEUE_FILE,
  resolve(programDir, defaultTranslateQueueFileName),
);

export const defaultContextDirectoryName = "context";
export const defaultContextQueueFileName = "contextQueue.json";

export const contextRootDir = resolveConfiguredPath(
  process.env.CONTEXT_DIR,
  resolve(tempRootDir, defaultContextDirectoryName),
);
export const contextQueueFile = resolveConfiguredPath(
  process.env.CONTEXT_QUEUE_FILE,
  resolve(programDir, defaultContextQueueFileName),
);

export const defaultOllamaHost = "http://localhost:11434";
export const ollamaHost = readStringEnv(process.env.OLLAMA_HOST, defaultOllamaHost);

export const defaultOllamaTranslateModel = "translategemma:12b";
export const ollamaTranslateModel = readStringEnv(process.env.OLLAMA_TRANSLATE_MODEL, defaultOllamaTranslateModel);

export const defaultTranslateTargetLanguage = "Chinese";
export const translateTargetLanguage = readStringEnv(process.env.TRANSLATE_TARGET_LANGUAGE, defaultTranslateTargetLanguage);

/**
 * Number of recently-translated pages to include as translation context when sending a page to
 * Ollama. Capping this prevents the system prompt from growing unboundedly on long manga and
 * reduces the chance of the model producing malformed JSON output.
 *
 * Set to 0 to include no translation history (OCR context is always sent in full).
 * Set to -1 to include all translated pages (original behaviour, not recommended for long manga).
 */
const parseTranslateContextPages = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < -1) {
    throw new Error(`Invalid TRANSLATE_CONTEXT_PAGES: ${value}. Expected -1 (all) or an integer >= 0.`);
  }
  return parsed;
};
export const defaultTranslateContextPages = 8;
export const translateContextPages = parseTranslateContextPages(process.env.TRANSLATE_CONTEXT_PAGES, defaultTranslateContextPages);

/**
 * Number of OCR pages to send per AI call during context/term detection.
 * Chunking prevents exceeding the model's context window on long manga.
 *
 * Set to -1 to send all pages in a single call (original behaviour, not recommended for long manga).
 */
const parseContextChunkPages = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || (parsed < 1 && parsed !== -1)) {
    throw new Error(`Invalid CONTEXT_CHUNK_PAGES: ${value}. Expected -1 (all) or an integer >= 1.`);
  }
  return parsed;
};
export const defaultContextChunkPages = 10;
export const contextChunkPages = parseContextChunkPages(process.env.CONTEXT_CHUNK_PAGES, defaultContextChunkPages);

// --- Memory (Mem0 + local Qdrant + Ollama — no Docker required) ---

/**
 * Persistent translation memory is ENABLED by default.
 *
 * Memory requires the memory venv to be installed (`bun run memory:bootstrap`)
 * and Ollama to be running with the embedding model available
 * (`ollama pull nomic-embed-text`).
 *
 * If the venv is not installed yet, all memory operations silently degrade to
 * no-ops — the translation pipeline continues normally.
 *
 * Set MEMORY_ENABLED=false to completely disable memory if desired.
 */
export const memoryEnabled = (process.env.MEMORY_ENABLED ?? "true").toLowerCase() !== "false";

export const memoryVenvDir = resolve(tempRootDir, "memory-venv");
export const memoryPython = resolve(memoryVenvDir, "bin", "python");

/**
 * Number of parallel memory CLI subprocess calls to run at the same time during
 * term pre-fill lookups. Higher values reduce wall-clock time but increase
 * process-spawn overhead; 4 is a sensible default for most machines.
 */
export const memorySearchConcurrency = parsePositiveInteger(process.env.MEMORY_SEARCH_CONCURRENCY, 4, "MEMORY_SEARCH_CONCURRENCY");

/**
 * Ollama embedding model used to convert text into vector representations for
 * semantic search in the Qdrant vector store.
 *
 * WHY a separate model?
 *   - The translation LLM (e.g. translategemma:12b) generates text.
 *   - The embedding model converts text → a fixed-size numeric vector so that
 *     Qdrant can find semantically similar memories quickly (nearest-neighbour
 *     search) without running a full LLM inference on every lookup.
 *   - Embedding models are lightweight and fast; they run alongside the main
 *     LLM without significant overhead.
 *
 * Pull it once with: `ollama pull nomic-embed-text`
 */
export const defaultOllamaEmbedModel = "nomic-embed-text";
export const ollamaEmbedModel = readStringEnv(process.env.OLLAMA_EMBED_MODEL, defaultOllamaEmbedModel);

/**
 * On-disk path for the embedded Qdrant database.
 * No Qdrant server or Docker is required — the database runs in-process.
 */
export const qdrantStoragePath = resolveConfiguredPath(
  process.env.QDRANT_STORAGE_PATH,
  resolve(tempRootDir, "qdrant_storage"),
);

/**
 * Maximum characters for the combined source and translated text in a
 * per-page Translation Memory entry stored after each page is translated.
 * Keeps individual memory entries compact to avoid Qdrant payload bloat.
 */
export const memoryTmMaxChars = 400;

// --- Text Cleaner (local textless Python pipeline) ---
export const textCleanerVenvDir = resolve(tempRootDir, "text-cleaner-venv");
export const textCleanerPython = resolve(textCleanerVenvDir, "bin", "python");
export const textCleanerInpaintingSize = parsePositiveInteger(process.env.TEXT_CLEANER_INPAINTING_SIZE, 2560, "TEXT_CLEANER_INPAINTING_SIZE");
export const textCleanerMaskDilation = parsePositiveInteger(process.env.TEXT_CLEANER_MASK_DILATION, 5, "TEXT_CLEANER_MASK_DILATION");
export const textCleanerPasses = parsePositiveInteger(process.env.TEXT_CLEANER_PASSES, 1, "TEXT_CLEANER_PASSES");
export const textCleanerDevice = readStringEnv(process.env.TEXT_CLEANER_DEVICE, "auto");