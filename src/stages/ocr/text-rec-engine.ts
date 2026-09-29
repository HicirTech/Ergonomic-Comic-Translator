import type * as Ort from "onnxruntime-node";
import type { GrayImage } from "../../imaging/interfaces/index.ts";
import { createPageCache, resizeGray } from "../../imaging/page-image.ts";
import { modelFilePath } from "../../models/lock.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import { ctcCharacters, ctcGreedyDecode } from "./ctc-decode.ts";
import type { OcrCandidate, OcrTask } from "./interfaces/index.ts";
import { grayCandidates } from "./ocr-crops.ts";

const lineHeight = 48;
/** RecResizeImg pads narrow lines to 320 px; wider lines keep their aspect up to this width. */
const minWidth = 320;
const maxWidth = 3200;

/** PP-OCR normalisation: (v / 255 - 0.5) / 0.5, padding stays 0 (mid-gray) after normalisation. */
const toRecTensor = (image: GrayImage, width: number) => {
  const plane = lineHeight * width;
  const tensor = new Float32Array(3 * plane);
  for (let row = 0; row < lineHeight; row += 1) {
    for (let column = 0; column < image.width; column += 1) {
      const value = image.data[row * image.width + column]! / 127.5 - 1;
      const index = row * width + column;
      tensor[index] = value;
      tensor[plane + index] = value;
      tensor[2 * plane + index] = value;
    }
  }
  return tensor;
};

/**
 * PP-OCRv5 line recognition (CTC) for horizontal lines: structure OCR for utterance splitting, the
 * second opinion for zh/en, and Korean with the korean_PP-OCRv5 model. Crops must read left to right;
 * vertical columns arrive already turned by readingCorners.
 */
export const createTextRecEngine = (modelId: "ppocr-rec-server" | "ppocr-rec-korean"): VisionEngine => {
  let ort: typeof Ort | null = null;
  let session: Ort.InferenceSession | null = null;
  let characters: string[] = [];
  const pages = createPageCache();

  const read = async (image: GrayImage) => {
    const scaledWidth = Math.min(maxWidth, Math.max(16, Math.ceil((image.width * lineHeight) / image.height)));
    const resized = await resizeGray(image, scaledWidth, lineHeight);
    const width = Math.max(minWidth, scaledWidth);
    const out = await session!.run({ x: new ort!.Tensor("float32", toRecTensor(resized, width), [1, 3, lineHeight, width]) });
    const probabilities = out[session!.outputNames[0]!]!;
    const [, steps, classes] = probabilities.dims as number[];
    return ctcGreedyDecode(probabilities.data as Float32Array, steps!, classes!, characters);
  };

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      const config = Bun.YAML.parse(await Bun.file(modelFilePath(modelsRoot, modelId, "inference.yml")).text()) as {
        PostProcess: { character_dict: unknown[] };
      };
      characters = ctcCharacters(config.PostProcess.character_dict);
      session = await runtime.InferenceSession.create(modelFilePath(modelsRoot, modelId, "inference.onnx"), options);
      return { inputNames: [...session.inputNames], outputNames: [...session.outputNames] };
    },
    run: async (input) => {
      if (!ort || !session) throw new Error(`${modelId} is not loaded`);
      const task = input as OcrTask;
      const { gray } = await pages(task.imagePath);
      const results: OcrCandidate[][] = [];
      for (const crop of task.crops) {
        const readings: OcrCandidate[] = [];
        for (const candidate of grayCandidates(gray, crop)) {
          readings.push({ quarterTurns: candidate.quarterTurns, ...(await read(candidate.image)) });
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
