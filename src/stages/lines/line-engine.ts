import type * as Ort from "onnxruntime-node";
import { borderMedian, cropGray, padGray } from "../../imaging/gray.ts";
import { createPageCache, resizeGray } from "../../imaging/page-image.ts";
import { grayToNormalizedChw } from "../../imaging/tensor.ts";
import { modelFilePath } from "../../models/lock.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import { dbMapToPage, planDbCrop, planDbPage } from "./db-input.ts";
import { extractTextLines } from "./db-postprocess.ts";
import type { DbCropPlan, LineTask, TextLine } from "./interfaces/index.ts";

/**
 * S2b: text-line geometry with a PP-OCRv5 DB detector, per region crop or over the whole page.
 * The mobile and server models share one pipeline: their inference.yml files differ only in the model name.
 */
export const createLineEngine = (modelId: "ppocr-det-mobile" | "ppocr-det-server"): VisionEngine => {
  let ort: typeof Ort | null = null;
  let session: Ort.InferenceSession | null = null;
  const pages = createPageCache();

  const detect = async (plan: DbCropPlan, page: Awaited<ReturnType<typeof pages>>): Promise<TextLine[]> => {
    const crop = cropGray(page.gray, plan.box);
    const fill = borderMedian(crop);
    const scaled = plan.scale === 1 ? crop : await resizeGray(crop, plan.scaledWidth, plan.scaledHeight);
    const canvas = padGray(scaled, plan.pad, fill, plan.width, plan.height);
    const outputs = await session!.run({
      x: new ort!.Tensor("float32", grayToNormalizedChw(canvas), [1, 3, plan.height, plan.width]),
    });
    const probability = outputs[session!.outputNames[0]!]!.data as Float32Array;
    return extractTextLines(probability, plan.width, plan.height, dbMapToPage(plan));
  };

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      session = await runtime.InferenceSession.create(modelFilePath(modelsRoot, modelId, "inference.onnx"), options);
      return { inputNames: [...session.inputNames], outputNames: [...session.outputNames] };
    },
    run: async (input) => {
      if (!ort || !session) throw new Error("line detector is not loaded");
      const task = input as LineTask;
      const page = await pages(task.imagePath);
      if (task.regions === null) {
        return [await detect(planDbPage(page.gray.width, page.gray.height), page)];
      }
      const results: TextLine[][] = [];
      for (const region of task.regions) {
        results.push(await detect(planDbCrop(region, page.gray.width, page.gray.height), page));
      }
      return results;
    },
    release: async () => {
      await session?.release();
      session = null;
    },
  };
};
