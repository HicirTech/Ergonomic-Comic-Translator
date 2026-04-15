import { jsonResponse } from "../utils";
import type { PolishQueueService } from "../services";

export const createPolishRoutes = (polishQueueService: PolishQueueService) => {
  const handleGetPolishQueue = async () =>
    jsonResponse(await polishQueueService.getQueueStatus());

  const handlePostPolish = async (uploadId: string, request: Request) => {
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
    const result = await polishQueueService.enqueue(uploadId, { targetLanguage, model });
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetPolishJob = async (uploadId: string) => {
    const result = await polishQueueService.getJob(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  return {
    handleGetPolishQueue,
    handlePostPolish,
    handleGetPolishJob,
  };
};
