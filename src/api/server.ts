import { getLogger } from "../logger.ts";
import { apiHost, apiPort, apiRoutes, contextQueueFile, ocrQueueFile, polishQueueFile, textlessQueueFile, translateQueueFile, uploadRecordsFile } from "../config.ts";
import { jsonResponse } from "./utils";
import { createRouter, type RouteDefinition } from "./router.ts";
import { createFileContextJobRepository, createFileOcrJobRepository, createFilePolishJobRepository, createFileTextlessJobRepository, createFileTranslationJobRepository, createFileUploadRecordRepository } from "./repositories";
import { buildApiConfigResponse, createContextQueueService, createOcrQueueService, createPolishQueueService, createTextlessQueueService, createTranslateQueueService, createUploadService } from "./services";
import { createContextRoutes } from "./routes/context-routes.ts";
import { createOcrRoutes } from "./routes/ocr-routes.ts";
import { createPolishRoutes } from "./routes/polish-routes.ts";
import { createTextlessRoutes } from "./routes/textless-routes.ts";
import { createTranslateRoutes } from "./routes/translate-routes.ts";
import { createUploadRoutes } from "./routes/upload-routes.ts";

const ID = "(?<uploadId>[^/]+)";
const PAGE = "(?<page>\\d+)";

const uploadRepository = createFileUploadRecordRepository(uploadRecordsFile);
const ocrJobRepository = createFileOcrJobRepository(ocrQueueFile);
const textlessJobRepository = createFileTextlessJobRepository(textlessQueueFile);
const translateJobRepository = createFileTranslationJobRepository(translateQueueFile);
const polishJobRepository = createFilePolishJobRepository(polishQueueFile);
const contextJobRepository = createFileContextJobRepository(contextQueueFile);
const uploadService = createUploadService(uploadRepository);
const ocrQueueService = createOcrQueueService(uploadRepository, ocrJobRepository);
const textlessQueueService = createTextlessQueueService(uploadRepository, textlessJobRepository);
const translateQueueService = createTranslateQueueService(translateJobRepository);
const polishQueueService = createPolishQueueService(polishJobRepository);
const contextQueueService = createContextQueueService(contextJobRepository);

const upload = createUploadRoutes(uploadService, ocrQueueService);
const ocr = createOcrRoutes(ocrQueueService);
const textless = createTextlessRoutes(textlessQueueService);
const translate = createTranslateRoutes(translateQueueService);
const polish = createPolishRoutes(polishQueueService);
const context = createContextRoutes(contextQueueService);

const p = (id: string) => parseInt(id, 10);

const routes: RouteDefinition[] = [
  // Health & config
  { method: "GET", pattern: apiRoutes.health, handler: () => jsonResponse({ status: "ok" }) },
  { method: "GET", pattern: apiRoutes.config, handler: () => jsonResponse(buildApiConfigResponse()) },
  { method: "GET", pattern: apiRoutes.files, handler: () => upload.handleGetFiles() },

  // Upload resource routes
  { method: "POST",             pattern: apiRoutes.upload, handler: ({ request }) => upload.handlePostUpload(request) },
  { method: "GET",              pattern: new RegExp(`^/api/uploads/${ID}/cover$`), handler: ({ params }) => upload.handleGetUploadCover(params.uploadId) },
  { method: "GET",              pattern: new RegExp(`^/api/uploads/${ID}/pages$`), handler: ({ params }) => upload.handleGetUploadPages(params.uploadId) },
  { method: "GET",              pattern: new RegExp(`^/api/uploads/${ID}/pages/${PAGE}$`), handler: ({ params }) => upload.handleGetUploadPage(params.uploadId, p(params.page)) },
  { method: ["GET", "HEAD"],    pattern: new RegExp(`^/api/uploads/${ID}/textless/pages/${PAGE}$`), handler: ({ request, params }) => upload.handleGetTextlessPage(params.uploadId, p(params.page), request.method as "GET" | "HEAD") },
  { method: "DELETE",           pattern: new RegExp(`^/api/uploads/${ID}$`), handler: ({ params }) => upload.handleDeleteUpload(params.uploadId) },

  // OCR routes
  { method: "GET",    pattern: apiRoutes.ocr, handler: () => ocr.handleGetOcrQueue() },
  { method: "POST",   pattern: new RegExp(`^${apiRoutes.ocr}/${ID}/${PAGE}$`), handler: ({ params, request }) => ocr.handlePostOcrPage(params.uploadId, p(params.page), request) },
  { method: "PUT",    pattern: new RegExp(`^${apiRoutes.ocr}/${ID}/${PAGE}$`), handler: ({ params, request }) => ocr.handlePutOcrPage(params.uploadId, p(params.page), request) },
  { method: "GET",    pattern: new RegExp(`^${apiRoutes.ocr}/${ID}/${PAGE}$`), handler: ({ params }) => ocr.handleGetOcrPage(params.uploadId, p(params.page)) },
  { method: "POST",   pattern: new RegExp(`^${apiRoutes.ocr}/${ID}$`), handler: ({ params, request }) => ocr.handlePostOcr(params.uploadId, request) },
  { method: "DELETE",  pattern: new RegExp(`^${apiRoutes.ocr}/${ID}$`), handler: ({ params }) => ocr.handleDeleteOcr(params.uploadId) },
  { method: "GET",    pattern: new RegExp(`^${apiRoutes.ocr}/${ID}$`), handler: ({ params }) => ocr.handleGetOcrJob(params.uploadId) },

  // Textless routes
  { method: "GET",  pattern: apiRoutes.textless, handler: () => textless.handleGetTextlessQueue() },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.textless}/${ID}/${PAGE}$`), handler: ({ params }) => textless.handlePostTextless(params.uploadId, p(params.page)) },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.textless}/${ID}$`), handler: ({ params }) => textless.handlePostTextless(params.uploadId) },
  { method: "GET",  pattern: new RegExp(`^${apiRoutes.textless}/${ID}$`), handler: ({ params }) => textless.handleGetTextlessJob(params.uploadId) },

  // Translate routes
  { method: "GET",  pattern: apiRoutes.translate, handler: () => translate.handleGetTranslateQueue() },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.translate}/${ID}/${PAGE}$`), handler: ({ params, request }) => translate.handlePostTranslate(params.uploadId, p(params.page), request) },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.translate}/${ID}$`), handler: ({ params, request }) => translate.handlePostTranslate(params.uploadId, undefined, request) },
  { method: "GET",  pattern: new RegExp(`^${apiRoutes.translate}/${ID}/${PAGE}$`), handler: ({ params }) => translate.handleGetTranslatePage(params.uploadId, p(params.page)) },
  { method: "PUT",  pattern: new RegExp(`^${apiRoutes.translate}/${ID}/${PAGE}$`), handler: ({ params, request }) => translate.handlePutTranslatePage(params.uploadId, p(params.page), request) },
  { method: "GET",  pattern: new RegExp(`^${apiRoutes.translate}/${ID}$`), handler: ({ params }) => translate.handleGetTranslateJob(params.uploadId) },

  // Polish routes
  { method: "GET",  pattern: apiRoutes.polish, handler: () => polish.handleGetPolishQueue() },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.polish}/${ID}$`), handler: ({ params, request }) => polish.handlePostPolish(params.uploadId, request) },
  { method: "GET",  pattern: new RegExp(`^${apiRoutes.polish}/${ID}$`), handler: ({ params }) => polish.handleGetPolishJob(params.uploadId) },

  // Context routes
  { method: "GET",  pattern: apiRoutes.context, handler: () => context.handleGetContextQueue() },
  { method: "GET",  pattern: new RegExp(`^${apiRoutes.context}/${ID}/terms$`), handler: ({ params }) => context.handleGetContextTerms(params.uploadId) },
  { method: "PUT",  pattern: new RegExp(`^${apiRoutes.context}/${ID}/terms$`), handler: ({ params, request }) => context.handlePutContextTerms(params.uploadId, request) },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.context}/${ID}/${PAGE}$`), handler: ({ params, request }) => context.handlePostContext(params.uploadId, p(params.page), request) },
  { method: "POST", pattern: new RegExp(`^${apiRoutes.context}/${ID}$`), handler: ({ params, request }) => context.handlePostContext(params.uploadId, undefined, request) },
  { method: "GET",  pattern: new RegExp(`^${apiRoutes.context}/${ID}$`), handler: ({ params }) => context.handleGetContextJob(params.uploadId) },
];

const router = createRouter(routes);

export const startApiServer = () => {
  const logger = getLogger("server");
  const server = Bun.serve({
    hostname: apiHost,
    port: apiPort,
    maxRequestBodySize: 1024 * 1024 * 1024, // 1 GiB
    async fetch(request) {
      try {
        return await router(request);
      } catch (error) {
        return jsonResponse({
          error: error instanceof Error ? error.message : String(error),
        }, 500);
      }
    },
  });

  logger.info(`API server listening on http://${apiHost}:${apiPort}`);
  for (const route of routes) {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const pattern = typeof route.pattern === "string" ? route.pattern : route.pattern.source;
    for (const method of methods) {
      logger.info(`${method} ${pattern}`);
    }
  }
  return server;
};

if (import.meta.main) {
  startApiServer();
}
