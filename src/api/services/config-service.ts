import {
  apiUploadsRootDir,
  defaultOcrOutputScopeName,
  defaultOcrConcurrency,
  defaultOcrDevice,
  defaultOcrLanguage,
  defaultOcrModel,
  filesRootDir,
  ocrOutputFileName,
  ocrQueueFile,
  ocrOutputRootDir,
  ocrPrepareRootDir,
  ocrSourceName,
  programDir,
  projectRoot,
  resolveOcrRuntimeConfig,
  tempRootDir,
  textlessRootDir,
  translatedRootDir,
  uploadRecordsFile,
} from "../../config.ts";
import { supportedOcrModels } from "../../ocr";
import type { ApiConfigResponse } from "../interfaces";
import {
  apiHost,
  apiPort,
  apiRoutes,
  supportedArchiveExtractExtensions,
  supportedUploadExtensions,
  textlessQueueFile,
  translateQueueFile,
} from "../../config.ts";

export const buildApiConfigResponse = (): ApiConfigResponse => ({
  server: {
    host: apiHost,
    port: apiPort,
    endpoints: apiRoutes,
  },
  paths: {
    projectRoot,
    tempRootDir,
    programDir,
    filesRootDir,
    apiUploadsRootDir,
    ocrPrepareRootDir,
    ocrOutputRootDir,
    textlessRootDir,
    translatedRootDir,
    ocrOutputFileName,
    defaultOcrOutputScope: defaultOcrOutputScopeName,
    ocrQueueFile,
    textlessQueueFile,
    translateQueueFile,
    uploadRecordsFile,
    ocrSourceName,
  },
  ocr: {
    current: resolveOcrRuntimeConfig(),
    defaults: {
      model: defaultOcrModel,
      language: defaultOcrLanguage,
      device: defaultOcrDevice,
      concurrency: defaultOcrConcurrency,
    },
    configurableOptions: {
      model: [...supportedOcrModels],
      language: "Freeform PaddleOCR language code or alias.",
      device: ["auto", "cpu", "gpu:0"],
      concurrency: {
        min: 1,
      },
    },
  },
  uploads: {
    targetDirectory: apiUploadsRootDir,
    metadataStore: uploadRecordsFile,
    acceptedExtensions: [...supportedUploadExtensions],
    archiveExtractExtensions: [...supportedArchiveExtractExtensions],
    acceptsZipExtraction: true,
  },
  persistence: {
    uploadRecordRepository: "file",
    databaseLayerReady: true,
  },
});
