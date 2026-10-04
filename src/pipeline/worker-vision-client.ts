import type { Box } from "../geometry/interfaces/index.ts";
import type { InpaintTask } from "../stages/clean/interfaces/index.ts";
import type { Detection } from "../stages/detect/interfaces/index.ts";
import type { TextLine } from "../stages/lines/interfaces/index.ts";
import type { OcrCandidate, OcrCrop, OrientationReading } from "../stages/ocr/interfaces/index.ts";
import type { ExecutionProvider, LoadResult } from "../workers/interfaces/index.ts";
import type { WorkerSupervisor } from "../workers/worker-supervisor.ts";
import type { VisionClient } from "./interfaces/index.ts";

/**
 * Which worker hosts which engine. G (GPU EP) runs the heavy convolutional models; C (CPU) runs the
 * small line models and manga-ocr. Baberu's decoders run on the CPU inside G. A session loads one of
 * the two inpainting engines (see `loadAll`).
 */
export const engineLanes = {
  detector: "gpu",
  baberu: "gpu",
  lama: "gpu",
  migan: "gpu",
  lines: "cpu",
  "text-rec": "cpu",
  "textline-ori": "cpu",
  "manga-ocr": "cpu",
} as const;

type EngineName = keyof typeof engineLanes;
type InpaintEngine = "lama" | "migan";

const loadTimeoutMs = 120_000;
/** A single model run gets 10 s (a hung DirectML call is killed); batched requests scale with their size. */
const perRunTimeoutMs = 10_000;
const maxRequestTimeoutMs = 300_000;

const timeoutFor = (runs: number) => Math.min(maxRequestTimeoutMs, perRunTimeoutMs * Math.max(1, runs));
const runsIn = (crops: readonly OcrCrop[]) => crops.reduce((sum, crop) => sum + crop.quarterTurns.length, 0);

/** VisionClient over a GPU worker and a CPU worker. */
export const createWorkerVisionClient = (gpu: Pick<WorkerSupervisor, "request">, cpu: Pick<WorkerSupervisor, "request">) => {
  const worker = (engine: EngineName) => (engineLanes[engine] === "gpu" ? gpu : cpu);
  const task = <T>(engine: EngineName, body: unknown, runs: number) =>
    worker(engine).request({ kind: "task", engine, task: body }, timeoutFor(runs)) as Promise<T>;
  const sessionEngines = (Object.keys(engineLanes) as EngineName[]).filter((engine) => engine !== "lama" && engine !== "migan");
  let inpaintEngine: InpaintEngine = "migan";

  const client: VisionClient = {
    detect: (imagePath) => task<{ width: number; height: number; detections: Detection[] }>("detector", { imagePath, minScore: 0.3 }, 1),
    lines: (imagePath, regions: Box[] | null) => task<TextLine[][]>("lines", { imagePath, regions }, regions?.length ?? 1),
    recognizeLines: (imagePath, crops) => task<OcrCandidate[][]>("text-rec", { imagePath, crops }, runsIn(crops)),
    readUtterances: (imagePath, crops, engine) => task<OcrCandidate[][]>(engine, { imagePath, crops }, runsIn(crops)),
    orientation: (imagePath, crops) => task<OrientationReading[][]>("textline-ori", { imagePath, crops }, runsIn(crops)),
    inpaint: async (inpaint: InpaintTask) => {
      await task(inpaintEngine, inpaint, inpaint.tiles.length);
    },
  };

  /**
   * Loads every engine of the session on its lane; the GPU lane uses `gpuEp`, the CPU lane always the CPU.
   *
   * The inpainting engine comes first. Where the lane has a GPU it is LaMa on WebGPU: DirectML rejects the
   * MatMul of LaMa's Fourier units (HRESULT 0x80070057), WebGPU runs them (105 ms a tile on an RTX 5090,
   * next to DirectML sessions in the same process), and its fill restores the picture under text far
   * better than MI-GAN's. Where WebGPU cannot host it, and on the CPU, where LaMa takes a second a tile,
   * MI-GAN serves. A WebGPU load that takes the worker down costs nothing at that point: the next load
   * starts a fresh worker.
   */
  const loadAll = async (modelsRoot: string, gpuEp: ExecutionProvider) => {
    const load = async (engine: EngineName, ep: ExecutionProvider) =>
      (await worker(engine).request({ kind: "load", engine, modelsRoot, ep }, loadTimeoutMs)) as LoadResult;
    const results: LoadResult[] = [];
    inpaintEngine = "migan";
    if (gpuEp.name !== "cpu") {
      try {
        results.push(await load("lama", { name: "webgpu" }));
        inpaintEngine = "lama";
      } catch {
        // No WebGPU for LaMa on this machine: MI-GAN is loaded below.
      }
    }
    if (inpaintEngine === "migan") results.push(await load("migan", gpuEp));
    for (const engine of sessionEngines) {
      results.push(await load(engine, engineLanes[engine] === "gpu" ? gpuEp : { name: "cpu" }));
    }
    return results;
  };

  return { client, loadAll };
};
