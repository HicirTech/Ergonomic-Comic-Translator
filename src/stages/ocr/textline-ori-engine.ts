import type * as Ort from "onnxruntime-node";
import { createPageCache, resizeGray } from "../../imaging/page-image.ts";
import { grayToNormalizedChw } from "../../imaging/tensor.ts";
import { modelFilePath } from "../../models/lock.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import type { OcrTask, OrientationReading } from "./interfaces/index.ts";
import { grayCandidates } from "./ocr-crops.ts";
import { softmaxProbability } from "./token-math.ts";

const inputWidth = 160;
const inputHeight = 80;
const upsideDownClass = 1;

/**
 * PP-LCNet textline orientation: probability that an upright-looking line is upside down (180 degrees).
 * Only used for 0/180: the spike showed it confuses sideways text with 180 in 46 % of cases.
 */
export const createTextlineOriEngine = (): VisionEngine => {
  let ort: typeof Ort | null = null;
  let session: Ort.InferenceSession | null = null;
  const pages = createPageCache();

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      session = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "textline-ori", "inference.onnx"), options);
      return { inputNames: [...session.inputNames], outputNames: [...session.outputNames] };
    },
    run: async (input) => {
      if (!ort || !session) throw new Error("textline-ori is not loaded");
      const task = input as OcrTask;
      const { gray } = await pages(task.imagePath);
      const results: OrientationReading[][] = [];
      for (const crop of task.crops) {
        const readings: OrientationReading[] = [];
        for (const candidate of grayCandidates(gray, crop)) {
          const resized = await resizeGray(candidate.image, inputWidth, inputHeight);
          const out = await session.run({ x: new ort.Tensor("float32", grayToNormalizedChw(resized), [1, 3, inputHeight, inputWidth]) });
          const scores = out[session.outputNames[0]!]!.data as Float32Array;
          // The exported head already applies softmax; normalising again keeps raw logits safe too.
          const sum = scores[0]! + scores[1]!;
          const upsideDown = Math.abs(sum - 1) < 1e-3 ? scores[upsideDownClass]! : softmaxProbability(scores, upsideDownClass);
          readings.push({ quarterTurns: candidate.quarterTurns, upsideDown });
        }
        results.push(readings);
      }
      return results;
    },
    release: async () => {
      await session?.release();
      session = null;
    },
  };
};
