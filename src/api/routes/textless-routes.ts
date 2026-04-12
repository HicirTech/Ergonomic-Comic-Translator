import { jsonResponse } from "../utils";
import type { TextlessQueueService } from "../services";

export const createTextlessRoutes = (textlessQueueService: TextlessQueueService) => {
  const handleGetTextlessQueue = async () =>
    jsonResponse(await textlessQueueService.getQueueStatus());

  const handlePostTextless = async (uploadId: string, page?: number) => {
    const result = await textlessQueueService.enqueue(uploadId, page);
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetTextlessJob = async (uploadId: string) => {
    const result = await textlessQueueService.getJob(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  return { handleGetTextlessQueue, handlePostTextless, handleGetTextlessJob };
};
