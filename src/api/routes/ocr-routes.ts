import { supportedOcrModels } from "../../ocr/config";
import type { OcrLineItem } from "../../ocr/interfaces";
import { jsonResponse } from "../utils";
import type { OcrQueueService } from "../services";

export const createOcrRoutes = (ocrQueueService: OcrQueueService) => {
  const parseOcrBodyParams = async (
    request: Request,
  ): Promise<{ model?: (typeof supportedOcrModels)[number]; language?: string } | { error: string }> => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return {};
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const m = body.model;
      if (typeof m === "string" && !(supportedOcrModels as readonly string[]).includes(m)) {
        return { error: `Invalid model "${m}". Supported: ${supportedOcrModels.join(", ")}` };
      }
      const model = typeof m === "string" && (supportedOcrModels as readonly string[]).includes(m)
        ? m as (typeof supportedOcrModels)[number]
        : undefined;
      const language = typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : undefined;
      return { model, language };
    } catch {
      return { error: "Invalid JSON body." };
    }
  };

  const handleGetOcrQueue = async () => jsonResponse(await ocrQueueService.getQueueStatus());

  const handlePostOcr = async (uploadId: string, request: Request) => {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";
    const parsed = await parseOcrBodyParams(request);
    if ("error" in parsed) return jsonResponse({ error: parsed.error }, 400);
    const result = await ocrQueueService.enqueue(uploadId, { force, model: parsed.model, language: parsed.language });
    return jsonResponse(result.body, result.statusCode);
  };

  const handlePostOcrPage = async (uploadId: string, page: number, request: Request) => {
    const parsed = await parseOcrBodyParams(request);
    if ("error" in parsed) return jsonResponse({ error: parsed.error }, 400);
    const result = await ocrQueueService.enqueuePage(uploadId, page, parsed.model, parsed.language);
    return jsonResponse(result.body, result.statusCode);
  };

  const handlePutOcrPage = async (uploadId: string, page: number, request: Request) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ error: "Expected application/json body." }, 415);
    }

    let lines: OcrLineItem[];
    try {
      const body = (await request.json()) as { lines?: unknown };
      if (!Array.isArray(body.lines)) {
        return jsonResponse({ error: "Request body must include a lines array." }, 400);
      }

      const parsedLines: OcrLineItem[] = [];
      for (const [idx, raw] of body.lines.entries()) {
        const candidate = raw as Record<string, unknown>;
        const text = candidate.text;
        const orientation = candidate.orientation;
        const box = candidate.box;
        const polygon = candidate.polygon;

        const normalizedBox = box === null
          ? null
          : Array.isArray(box) && box.length === 4 && box.every((v) => typeof v === "number" && Number.isFinite(v))
            ? [box[0], box[1], box[2], box[3]] as [number, number, number, number]
            : null;

        const normalizedPolygon = polygon === null
          ? null
          : Array.isArray(polygon)
            ? polygon
              .filter((point): point is [number, number] =>
                Array.isArray(point) &&
                point.length === 2 &&
                typeof point[0] === "number" && Number.isFinite(point[0]) &&
                typeof point[1] === "number" && Number.isFinite(point[1]),
              )
              .map((point) => [point[0], point[1]] as [number, number])
            : null;

        if (typeof text !== "string") {
          return jsonResponse({ error: `Invalid line text at index ${idx}.` }, 400);
        }

        if (orientation !== null && orientation !== undefined && typeof orientation !== "string") {
          return jsonResponse({ error: `Invalid orientation at line index ${idx}.` }, 400);
        }

        parsedLines.push({
          lineIndex: idx,
          text,
          box: normalizedBox,
          polygon: normalizedPolygon,
          orientation: typeof orientation === "string" ? orientation : null,
        });
      }

      lines = parsedLines;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const result = await ocrQueueService.updatePageLines(uploadId, page, lines);
    return jsonResponse(result.body, result.statusCode);
  };

  const handleDeleteOcr = async (uploadId: string) => {
    const result = await ocrQueueService.remove(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetOcrJob = async (uploadId: string) => {
    const result = await ocrQueueService.getJob(uploadId);
    return jsonResponse(result.body, result.statusCode);
  };

  const handleGetOcrPage = async (uploadId: string, page: number) => {
    const result = await ocrQueueService.getPageLines(uploadId, page);
    return jsonResponse(result.body, result.statusCode);
  };

  return {
    handleGetOcrQueue,
    handlePostOcr,
    handlePostOcrPage,
    handlePutOcrPage,
    handleDeleteOcr,
    handleGetOcrJob,
    handleGetOcrPage,
  };
};
