import { readFileSync } from "fs";
import type * as Ort from "onnxruntime-node";
import type { RgbImage } from "../../imaging/interfaces/index.ts";
import { createPageCache, resizeRgb } from "../../imaging/page-image.ts";
import { rgbToNormalizedChw } from "../../imaging/tensor.ts";
import { modelFilePath } from "../../models/lock.ts";
import { sessionOptionsFor } from "../../ort/session-options.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import { createBaberuVocabulary, decodeBaberu, type BaberuVocabulary } from "./baberu-decode.ts";
import type { OcrCandidate, OcrTask } from "./interfaces/index.ts";
import { rgbCandidates } from "./ocr-crops.ts";

const inputSize = 224;
const decoderLayers = 6;
const pastNames = [
  ...Array.from({ length: decoderLayers }, (_, layer) => `past_k${layer}`),
  ...Array.from({ length: decoderLayers }, (_, layer) => `past_v${layer}`),
];

/**
 * Baberu OCR (ja/zh/en): the DINOv2 vision encoder runs on the worker's execution provider; the int8
 * decoders always run on the CPU (dynamic int8 kernels fall back to the CPU on GPU EPs anyway, and the
 * KV loop would round-trip every token). Port of onnx_infer.py from genshiai-daichi/baberu-ocr (Apache-2.0).
 */
export const createBaberuEngine = (): VisionEngine => {
  let ort: typeof Ort | null = null;
  let vision: Ort.InferenceSession | null = null;
  let prefill: Ort.InferenceSession | null = null;
  let step: Ort.InferenceSession | null = null;
  let vocabulary: BaberuVocabulary | null = null;
  const pages = createPageCache();

  /** present_* outputs feed the next step's past_* inputs, in the reference's positional order. */
  const pastFeeds = (outputs: Ort.InferenceSession.OnnxValueMapType, outputNames: readonly string[]) =>
    Object.fromEntries(pastNames.map((name, index) => [name, outputs[outputNames[index + 1]!]!]));

  const read = async (image: RgbImage) => {
    const resized = await resizeRgb(image, inputSize, inputSize, "cubic");
    const visionOut = await vision!.run({
      pixel_values: new ort!.Tensor("float32", rgbToNormalizedChw(resized), [1, 3, inputSize, inputSize]),
    });
    const embeds = visionOut.vision_embeds!;
    const visionTokens = embeds.dims[1]!;
    const first = await prefill!.run({ vision_embeds: embeds, input_ids: new ort!.Tensor("int64", BigInt64Array.from([1n]), [1, 1]) });
    let past = pastFeeds(first, prefill!.outputNames);
    const lastLogits = (outputs: Ort.InferenceSession.OnnxValueMapType, names: readonly string[]) => {
      const logits = outputs[names[0]!]!;
      const size = logits.dims[logits.dims.length - 1]!;
      const data = logits.data as Float32Array;
      return data.subarray(data.length - size);
    };
    return decodeBaberu(lastLogits(first, prefill!.outputNames), visionTokens, async (token, position) => {
      const out = await step!.run({
        input_ids: new ort!.Tensor("int64", BigInt64Array.from([BigInt(token)]), [1, 1]),
        position_ids: new ort!.Tensor("int64", BigInt64Array.from([BigInt(position)]), [1, 1]),
        ...past,
      });
      past = pastFeeds(out, step!.outputNames);
      return lastLogits(out, step!.outputNames);
    }, vocabulary!);
  };

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      const charset = JSON.parse(readFileSync(modelFilePath(modelsRoot, "baberu-ocr", "tokenizer/vocab.json"), "utf8")) as string[];
      vocabulary = createBaberuVocabulary(charset);
      vision = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "baberu-ocr", "onnx/vision_fp16.onnx"), options);
      const cpu = sessionOptionsFor({ name: "cpu" });
      prefill = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "baberu-ocr", "onnx/decoder_prefill_int8.onnx"), cpu);
      step = await runtime.InferenceSession.create(modelFilePath(modelsRoot, "baberu-ocr", "onnx/decoder_step_int8.onnx"), cpu);
      const missing = pastNames.filter((name) => !step!.inputNames.includes(name));
      if (missing.length > 0 || prefill.outputNames.length !== pastNames.length + 1) {
        throw new Error(`Baberu decoder I/O differs from the reference: missing ${missing.join(", ")}`);
      }
      return { inputNames: [...vision.inputNames, ...step.inputNames], outputNames: [...vision.outputNames, ...step.outputNames] };
    },
    run: async (input) => {
      if (!ort || !vision || !prefill || !step) throw new Error("baberu is not loaded");
      const task = input as OcrTask;
      const { rgb } = await pages(task.imagePath);
      const results: OcrCandidate[][] = [];
      for (const crop of task.crops) {
        const readings: OcrCandidate[] = [];
        for (const candidate of rgbCandidates(rgb, crop)) {
          readings.push({ quarterTurns: candidate.quarterTurns, ...(await read(candidate.image)) });
        }
        results.push(readings);
      }
      return results;
    },
    release: async () => {
      await vision?.release();
      await prefill?.release();
      await step?.release();
      vision = null;
      prefill = null;
      step = null;
    },
  };
};
