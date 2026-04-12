// Barrel re-export — domain modules split into separate files.
export type { UploadRecordSourceType, UploadRecord, UploadBatch, OcrJobStatus, OcrLineItem, OcrPageLines, TranslatedLine, TranslationPageLines, ContextTerm } from "./types.ts";
export { getUploadCoverUrl, getUploadPageUrl, getTextlessPageUrl, fetchUploadBatches, uploadFiles, deleteUpload, fetchUploadPages } from "./upload-api.ts";
export type { OcrConfig, OcrJobStatusResult } from "./ocr-api.ts";
export { fetchOcrConfig, enqueueOcr, enqueueOcrPage, fetchOcrJobStatus, fetchOcrPageLines, fetchAllOcrPageLines, saveOcrPageLines } from "./ocr-api.ts";
export type { TextlessJobStatusResult } from "./textless-api.ts";
export { enqueueTextless, enqueueTextlessPage, fetchTextlessJobStatus } from "./textless-api.ts";
export type { TranslationJobStatusResult } from "./translation-api.ts";
export { fetchTranslationPage, fetchAllTranslationPages, saveTranslationPage, enqueueTranslation, enqueueTranslationPage, fetchTranslationJobStatus } from "./translation-api.ts";
export type { ContextJobStatusResult } from "./context-api.ts";
export { fetchContextTerms, saveContextTerms, enqueueContext, fetchContextJobStatus } from "./context-api.ts";

