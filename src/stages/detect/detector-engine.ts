import type * as Ort from "onnxruntime-node";
import { createPageCache, resizeRgb } from "../../imaging/page-image.ts";
import { rgbToUnitChw } from "../../imaging/tensor.ts";
import { modelFilePath } from "../../models/lock.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import { decodeDetections, detectorInputSize } from "./detector-io.ts";
import type { DetectTask } from "./interfaces/index.ts";

/** S2: bubbles and text boxes for one page. Input is the page stretched to 640 x 640, values 0..1. */
export const createDetectorEngine = (): VisionEngine => {
  let ort: typeof Ort | null = null;
  let session: Ort.InferenceSession | null = null;
  const pages = createPageCache();

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      session = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "detector", "detector.onnx"), options);
      return { inputNames: [...session.inputNames], outputNames: [...session.outputNames] };
    },
    run: async (input) => {
      if (!ort || !session) throw new Error("detector is not loaded");
      const task = input as DetectTask;
      const { rgb } = await pages(task.imagePath);
      const resized = await resizeRgb(rgb, detectorInputSize, detectorInputSize);
      const outputs = await session.run({
        images: new ort.Tensor("float32", rgbToUnitChw(resized), [1, 3, detectorInputSize, detectorInputSize]),
        orig_target_sizes: new ort.Tensor("int64", BigInt64Array.from([BigInt(rgb.width), BigInt(rgb.height)]), [1, 2]),
      });
      return {
        width: rgb.width,
        height: rgb.height,
        detections: decodeDetections(
          outputs.labels!.data as BigInt64Array,
          outputs.boxes!.data as Float32Array,
          outputs.scores!.data as Float32Array,
          rgb.width,
          rgb.height,
          task.minScore,
        ),
      };
    },
    release: async () => {
      await session?.release();
      session = null;
    },
  };
};
