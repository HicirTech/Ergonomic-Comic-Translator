import type { OcrRuntimeConfig } from "../../ocr/interfaces";
import type { OcrModel } from "../../ocr/config/ocr-model.ts";

/** Full server configuration snapshot returned by GET /api/config. */
export interface ApiConfigResponse {
  /** HTTP server binding details and known API route paths. */
  server: {
    host: string;
    port: number;
    endpoints: {
      config: string;
      files: string;
      upload: string;
      health: string;
    };
  };
  /** Absolute filesystem paths used by the server. */
  paths: {
    projectRoot: string;
    tempRootDir: string;
    programDir: string;
    filesRootDir: string;
    /** Root directory where uploaded files are stored. */
    apiUploadsRootDir: string;
    /** Root directory where OCR preparation artifacts (split PDFs, copied images) are stored. */
    ocrPrepareRootDir: string;
    /** Root directory where merged OCR output JSON files are stored. */
    ocrOutputRootDir: string;
    /** Root directory where text-removed images are written. */
    textlessRootDir: string;
    /** Root directory where translated JSON output files are written. */
    translatedRootDir: string;
    /** Base filename of the OCR output file inside each scope directory. */
    ocrOutputFileName: string;
    defaultOcrOutputScope: string;
    /** Path to the JSON file persisting OCR job records. */
    ocrQueueFile: string;
    /** Path to the JSON file persisting textless job records. */
    textlessQueueFile: string;
    /** Path to the JSON file persisting translation job records. */
    translateQueueFile: string;
    /** Path to the JSON file persisting upload records. */
    uploadRecordsFile: string;
    ocrSourceName: string;
  };
  /** Current and default OCR engine settings. */
  ocr: {
    current: OcrRuntimeConfig;
    defaults: {
      model: OcrModel;
      language: string;
      device: string;
      concurrency: number;
    };
    configurableOptions: {
      model: OcrModel[];
      language: string;
      device: string[];
      concurrency: {
        min: number;
      };
    };
  };
  /** Upload handling settings. */
  uploads: {
    targetDirectory: string;
    metadataStore: string;
    acceptedExtensions: string[];
    archiveExtractExtensions: string[];
    acceptsZipExtraction: boolean;
  };
  /** Backend persistence layer information. */
  persistence: {
    uploadRecordRepository: string;
    databaseLayerReady: boolean;
  };
}
