import { jsonResponse } from "../utils";
import type { ContextQueueService } from "../services/context-queue-service.ts";
import type { ContextTerm } from "../interfaces/context-job-record.ts";

export const createContextRoutes = (contextQueueService: ContextQueueService) => {
  const handleGetContextQueue = async () =>
    jsonResponse(await contextQueueService.getQueueStatus());

  const handlePostContext = async (
    uploadId: string,
    page: number | undefined,
    request: Request,
  ) => {
    let model: string | undefined;
    let targetLanguage: string | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (typeof body.model === "string") model = body.model;
        if (typeof body.targetLanguage === "string") targetLanguage = body.targetLanguage;
      } catch {
        return jsonResponse({ error: "Invalid JSON body." }, 400);
      }
    }
    const result = await contextQueueService.enqueue(uploadId, { pageNumber: page, model, targetLanguage });
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetContextJob = async (uploadId: string) => {
    const result = await contextQueueService.getJob(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  /** GET /api/context/{uploadId}/terms — fetch current glossary */
  const handleGetContextTerms = (uploadId: string) => {
    const result = contextQueueService.getTerms(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  /** PUT /api/context/{uploadId}/terms — save glossary edited by user */
  const handlePutContextTerms = async (uploadId: string, request: Request) => {
    let terms: unknown;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      terms = body.terms;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }
    if (!Array.isArray(terms)) return jsonResponse({ error: "terms must be an array." }, 400);
    const result = contextQueueService.putTerms(uploadId, terms as ContextTerm[]);
    return jsonResponse(result.body, result.statusCode);
  };

  return {
    handleGetContextQueue,
    handlePostContext,
    handleGetContextJob,
    handleGetContextTerms,
    handlePutContextTerms,
  };
};
