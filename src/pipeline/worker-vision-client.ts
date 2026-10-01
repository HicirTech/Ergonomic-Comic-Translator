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
 * small line models and manga-ocr. Inpainting is MI-GAN on G: LaMa's FFC MatMul is rejected by
 * DirectML (HRESULT 0x80070057) on this adapter. Baberu's decoders run on the CPU inside G.
 */
export const engineLanes = {
  detector: "gpu",
  baberu: "gpu",
  migan: "gpu",
  lines: "cpu",
  "text-rec": "cpu",
  "textline-ori": "cpu",
  "manga-ocr": "cpu",
} as const;

type EngineName = keyof typeof engineLanes;

const loadTimeoutMs = 120_000;
/** A single model run gets 10 s (a hung DirectML call is killed); batched requests scale with their size. */
const perRunTimeoutMs = 10_000;
const maxRequestTimeoutMs = 300_000;

const timeoutFor = (runs: number) => Math.min(maxRequestTimeoutMs, perRunTimeoutMs * Math.max(1, runs));
const runsIn = (crops: readonly OcrCrop[]) => crops.reduce((sum, crop) => sum + crop.quarterTurns.length, 0);

/** VisionClient over a GPU worker and a CPU worker. */
export const createWorkerVisionClient = (gpu: WorkerSupervisor, cpu: WorkerSupervisor) => {
  const worker = (engine: EngineName) => (engineLanes[engine] === "gpu" ? gpu : cpu);
  const task = <T>(engine: EngineName, body: unknown, runs: number) =>
    worker(engine).request({ kind: "task", engine, task: body }, timeoutFor(runs)) as Promise<T>;

  const client: VisionClient = {
    detect: (imagePath) => task<{ width: number; height: number; detections: Detection[] }>("detector", { imagePath, minScore: 0.3 }, 1),
    lines: (imagePath, regions: Box[] | null) => task<TextLine[][]>("lines", { imagePath, regions }, regions?.length ?? 1),
    recognizeLines: (imagePath, crops) => task<OcrCandidate[][]>("text-rec", { imagePath, crops }, runsIn(crops)),
    readUtterances: (imagePath, crops, engine) => task<OcrCandidate[][]>(engine, { imagePath, crops }, runsIn(crops)),
    orientation: (imagePath, crops) => task<OrientationReading[][]>("textline-ori", { imagePath, crops }, runsIn(crops)),
    inpaint: async (inpaint: InpaintTask) => {
      await task("migan", inpaint, inpaint.tiles.length);
    },
  };

  /** Loads every engine on its lane; the GPU lane uses `gpuEp`, the CPU lane always the CPU. */
  const loadAll = async (modelsRoot: string, gpuEp: ExecutionProvider) => {
    const results: LoadResult[] = [];
    for (const engine of Object.keys(engineLanes) as EngineName[]) {
      const ep = engineLanes[engine] === "gpu" ? gpuEp : ({ name: "cpu" } as const);
      results.push((await worker(engine).request({ kind: "load", engine, modelsRoot, ep }, loadTimeoutMs)) as LoadResult);
    }
    return results;
  };

  return { client, loadAll };
};
