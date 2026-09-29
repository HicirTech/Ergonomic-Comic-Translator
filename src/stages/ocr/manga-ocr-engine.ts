import { readFileSync } from "fs";
import type * as Ort from "onnxruntime-node";
import { createPageCache, resizeGray } from "../../imaging/page-image.ts";
import { grayToNormalizedChw } from "../../imaging/tensor.ts";
import { modelFilePath } from "../../models/lock.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import type { OcrCandidate, OcrTask } from "./interfaces/index.ts";
import { greedyDecodeMangaOcr } from "./manga-ocr-decode.ts";
import { grayCandidates } from "./ocr-crops.ts";

const inputSize = 224;
/** max_length from the model's config.json. */
const maxLength = 300;
const half = [0.5, 0.5, 0.5] as const;

/**
 * manga-ocr (VisionEncoderDecoder, fp32 ONNX export without KV cache): the Japanese fallback and the
 * reader for 1-3 character text, which it handles in any orientation.
 */
export const createMangaOcrEngine = (): VisionEngine => {
  let ort: typeof Ort | null = null;
  let encoder: Ort.InferenceSession | null = null;
  let decoder: Ort.InferenceSession | null = null;
  let vocabulary: string[] = [];
  const pages = createPageCache();

  const read = async (image: Parameters<typeof resizeGray>[0]) => {
    const resized = await resizeGray(image, inputSize, inputSize);
    const encoded = await encoder!.run({
      pixel_values: new ort!.Tensor("float32", grayToNormalizedChw(resized, half, half), [1, 3, inputSize, inputSize]),
    });
    const hidden = encoded.last_hidden_state!;
    return greedyDecodeMangaOcr(async (ids) => {
      const out = await decoder!.run({
        input_ids: new ort!.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        encoder_hidden_states: hidden,
      });
      const logits = out.logits!;
      const vocab = logits.dims[2]!;
      return (logits.data as Float32Array).subarray((ids.length - 1) * vocab, ids.length * vocab);
    }, vocabulary, maxLength);
  };

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      vocabulary = readFileSync(modelFilePath(modelsRoot, "manga-ocr-vocab", "vocab.txt"), "utf8").split(/\r?\n/u);
      encoder = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "manga-ocr", "onnx/encoder_model.onnx"), options);
      decoder = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "manga-ocr", "onnx/decoder_model.onnx"), options);
      return { inputNames: [...encoder.inputNames, ...decoder.inputNames], outputNames: [...encoder.outputNames, ...decoder.outputNames] };
    },
    run: async (input) => {
      if (!ort || !encoder || !decoder) throw new Error("manga-ocr is not loaded");
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
      await encoder?.release();
      await decoder?.release();
      encoder = null;
      decoder = null;
    },
  };
};
