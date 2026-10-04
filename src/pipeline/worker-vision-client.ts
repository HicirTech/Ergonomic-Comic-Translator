import type { Box } from "../geometry/interfaces/index.ts";
import { getLogger } from "../logger.ts";
import type { InpaintTask } from "../stages/clean/interfaces/index.ts";
import type { Detection } from "../stages/detect/interfaces/index.ts";
import type { TextLine } from "../stages/lines/interfaces/index.ts";
import type { OcrCandidate, OcrCrop, OrientationReading } from "../stages/ocr/interfaces/index.ts";
import { WorkerTaskError } from "../workers/errors/index.ts";
import type { ExecutionProvider, LoadResult } from "../workers/interfaces/index.ts";
import type { WorkerSupervisor } from "../workers/worker-supervisor.ts";
import type { VisionClient } from "./interfaces/index.ts";

const logger = getLogger("vision");

/**
 * Which worker hosts which engine. G (GPU EP) runs the heavy convolutional models; C (CPU) runs the
 * small line models and manga-ocr. Baberu's decoders run on the CPU inside G.
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

/** A session loads one of these to fill the picture under text. */
const inpaintEngines = ["lama", "migan"] as const satisfies readonly EngineName[];
type InpaintEngine = (typeof inpaintEngines)[number];

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
  const load = async (modelsRoot: string, engine: EngineName, ep: ExecutionProvider) =>
    (await worker(engine).request({ kind: "load", engine, modelsRoot, ep }, loadTimeoutMs)) as LoadResult;
  const sessionEngines = (Object.keys(engineLanes) as EngineName[]).filter((engine) => !(inpaintEngines as readonly EngineName[]).includes(engine));
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
   * LaMa runs on WebGPU because DirectML rejects the MatMul of its Fourier units (HRESULT 0x80070057).
   * Null where the WebGPU provider refuses the model.
   */
  const loadLamaOnWebGpu = async (modelsRoot: string) => {
    try {
      return await load(modelsRoot, "lama", { name: "webgpu" });
    } catch (error) {
      if (!(error instanceof WorkerTaskError)) throw error;
      logger.warn(`LaMa was not loaded on WebGPU (${error.code}: ${error.message}); MI-GAN fills the picture instead`);
      return null;
    }
  };

  /** Loads every engine of the session on its lane; the GPU lane uses `gpuEp`, the CPU lane always the CPU. */
  const loadAll = async (modelsRoot: string, gpuEp: ExecutionProvider) => {
    // On the CPU LaMa takes a second a tile, so a CPU session fills with MI-GAN.
    const lama = gpuEp.name === "cpu" ? null : await loadLamaOnWebGpu(modelsRoot);
    inpaintEngine = lama ? "lama" : "migan";
    const results = [lama ?? (await load(modelsRoot, "migan", gpuEp))];
    for (const engine of sessionEngines) {
      results.push(await load(modelsRoot, engine, engineLanes[engine] === "gpu" ? gpuEp : { name: "cpu" }));
    }
    return results;
  };

  return { client, loadAll };
};
