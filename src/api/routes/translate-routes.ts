import { jsonResponse } from "../utils";
import type { TranslateQueueService } from "../services";
import type { TranslationOutput } from "../interfaces";

export const createTranslateRoutes = (translateQueueService: TranslateQueueService) => {
  const handleGetTranslateQueue = async () =>
    jsonResponse(await translateQueueService.getQueueStatus());

  const handlePostTranslate = async (
    uploadId: string,
    page: number | undefined,
    request: Request,
  ) => {
    let targetLanguage: string | undefined;
    let model: string | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (typeof body.targetLanguage === "string") targetLanguage = body.targetLanguage;
        if (typeof body.model === "string") model = body.model;
      } catch {
        return jsonResponse({ error: "Invalid JSON body." }, 400);
      }
    }
    const result = await translateQueueService.enqueue(uploadId, {
      pageNumber: page,
      targetLanguage,
      model,
    });
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetTranslateJob = async (uploadId: string) => {
    const result = await translateQueueService.getJob(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetTranslatePage = (uploadId: string, pageNumber: number) => {
    const result = translateQueueService.getPageTranslation(uploadId, pageNumber);
    return jsonResponse(result.body, result.statusCode);
  };

  const handlePutTranslatePage = async (uploadId: string, pageNumber: number, request: Request) => {
    let lines: unknown;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      lines = body.lines;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }
    if (!Array.isArray(lines)) return jsonResponse({ error: "lines must be an array." }, 400);
    const result = translateQueueService.savePageTranslation(
      uploadId,
      pageNumber,
      lines as TranslationOutput[0]["lines"],
    );
    return jsonResponse(result.body, result.statusCode);
  };

  return {
    handleGetTranslateQueue,
    handlePostTranslate,
    handleGetTranslateJob,
    handleGetTranslatePage,
    handlePutTranslatePage,
  };
};
