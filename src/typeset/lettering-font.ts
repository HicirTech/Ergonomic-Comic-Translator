import type { DataPaths } from "../core/data-paths.ts";
import { modelFilePath, readModelsLock } from "../models/lock.ts";
import { loadHarfbuzzShaper } from "./harfbuzz-shaper.ts";

/** The pinned Simplified Chinese lettering font (models.lock.json, "fonts" pack). */
export const letteringFontModel = "font-noto-sans-sc-bold";

export const loadLetteringShaper = (paths: DataPaths) => {
  const font = readModelsLock().models[letteringFontModel]!;
  return loadHarfbuzzShaper(modelFilePath(paths.models, letteringFontModel, font.files[0]!.path));
};
