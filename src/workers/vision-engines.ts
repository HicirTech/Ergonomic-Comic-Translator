import { createLamaEngine, createMiganEngine } from "../stages/clean/inpaint-engine.ts";
import { createDetectorEngine } from "../stages/detect/detector-engine.ts";
import { createLineEngine } from "../stages/lines/line-engine.ts";
import { createBaberuEngine } from "../stages/ocr/baberu-engine.ts";
import { createMangaOcrEngine } from "../stages/ocr/manga-ocr-engine.ts";
import { createTextRecEngine } from "../stages/ocr/text-rec-engine.ts";
import { createTextlineOriEngine } from "../stages/ocr/textline-ori-engine.ts";
import type { VisionEngine } from "./interfaces/index.ts";

/** Engines a vision worker can host, keyed by the name used in load/task requests. */
export const visionEngineFactories: Record<string, () => VisionEngine> = {
  detector: createDetectorEngine,
  lines: createLineEngine,
  baberu: createBaberuEngine,
  "manga-ocr": createMangaOcrEngine,
  "text-rec": () => createTextRecEngine("ppocr-rec-server"),
  "text-rec-korean": () => createTextRecEngine("ppocr-rec-korean"),
  "textline-ori": createTextlineOriEngine,
  lama: createLamaEngine,
  migan: createMiganEngine,
};
