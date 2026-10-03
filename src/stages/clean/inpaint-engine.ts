import { readFileSync } from "fs";
import sharp from "sharp";
import type * as Ort from "onnxruntime-node";
import { decodeRgb } from "../../imaging/page-image.ts";
import { modelFilePath } from "../../models/lock.ts";
import type { VisionEngine } from "../../workers/interfaces/index.ts";
import { applyInpaint, inpaintTileSize } from "./inpaint-tiles.ts";
import type { InpaintTask } from "./interfaces/index.ts";

const size = inpaintTileSize;
const plane = size * size;

/** Model-specific tensor conventions, verified against the spike and the official MI-GAN pipeline script. */
interface InpaintModel {
  modelId: string;
  file: string;
  feeds(ort: typeof Ort, image: Uint8Array, holes: Uint8Array): Record<string, Ort.Tensor>;
  output(tensor: Ort.Tensor): Uint8Array;
}

const toPlanar = (image: Uint8Array, scale: number) => {
  const tensor = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) tensor[channel * plane + index] = image[index * 3 + channel]! * scale;
  }
  return tensor;
};

const fromPlanar = (data: ArrayLike<number>, scale: number) => {
  const image = new Uint8Array(plane * 3);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      image[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(Number(data[channel * plane + index]) * scale)));
    }
  }
  return image;
};

/** LaMa (manga): float image 0..1, float mask 1 = hole; output scale detected (0..1 or 0..255). */
const lama: InpaintModel = {
  modelId: "lama-manga",
  file: "lama-manga.onnx",
  feeds: (ort, image, holes) => ({
    image: new ort.Tensor("float32", toPlanar(image, 1 / 255), [1, 3, size, size]),
    mask: new ort.Tensor("float32", Float32Array.from(holes), [1, 1, size, size]),
  }),
  output: (tensor) => {
    const data = tensor.data as Float32Array;
    let max = 0;
    for (const value of data) max = Math.max(max, value);
    return fromPlanar(data, max <= 1.5 ? 255 : 1);
  },
};

/** Official MI-GAN pipeline v2: uint8 image, uint8 mask with 255 = keep and 0 = hole; uint8 output. */
const migan: InpaintModel = {
  modelId: "migan",
  file: "migan_pipeline_v2.onnx",
  feeds: (ort, image, holes) => ({
    image: new ort.Tensor("uint8", Uint8Array.from(toPlanar(image, 1)), [1, 3, size, size]),
    mask: new ort.Tensor("uint8", Uint8Array.from(holes, (hole) => (hole ? 0 : 255)), [1, 1, size, size]),
  }),
  output: (tensor) => fromPlanar(tensor.data as Uint8Array, 1),
};

/**
 * S6 inpainting for regions the membrane fill cannot restore. Reads the page and mask from files, runs 512 px
 * tiles, composites only masked pixels, and writes a lossless PNG, so no pixel data crosses the IPC.
 */
const createInpaintEngine = (model: InpaintModel): VisionEngine => {
  let ort: typeof Ort | null = null;
  let session: Ort.InferenceSession | null = null;

  return {
    load: async (runtime, modelsRoot, options) => {
      ort = runtime;
      session = await runtime.InferenceSession.create(modelFilePath(modelsRoot, model.modelId, model.file), options);
      const expected = ["image", "mask"];
      if (!expected.every((name) => session!.inputNames.includes(name))) {
        throw new Error(`${model.modelId} inputs are ${session.inputNames.join(", ")}, expected ${expected.join(", ")}`);
      }
      return { inputNames: [...session.inputNames], outputNames: [...session.outputNames] };
    },
    run: async (input) => {
      if (!ort || !session) throw new Error(`${model.modelId} is not loaded`);
      const task = input as InpaintTask;
      const rgb = await decodeRgb(task.imagePath);
      const mask = new Uint8Array(readFileSync(task.maskPath));
      if (rgb.width !== task.width || rgb.height !== task.height || mask.length !== task.width * task.height) {
        throw new Error("Inpaint task image, mask and size disagree");
      }
      const started = performance.now();
      await applyInpaint(rgb, mask, task.tiles, async (image, holes) => {
        const out = await session!.run(model.feeds(ort!, image, holes));
        return model.output(out[session!.outputNames[0]!]!);
      });
      await sharp(rgb.data, { raw: { width: rgb.width, height: rgb.height, channels: 3 } }).png().toFile(task.outputPath);
      return { tiles: task.tiles.length, ms: performance.now() - started };
    },
    release: async () => {
      await session?.release();
      session = null;
    },
  };
};

export const createLamaEngine = () => createInpaintEngine(lama);
export const createMiganEngine = () => createInpaintEngine(migan);
