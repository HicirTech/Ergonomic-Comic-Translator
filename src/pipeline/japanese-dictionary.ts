import { join } from "path";
import type { DataPaths } from "../core/data-paths.ts";
import type { ModelsLock } from "../models/interfaces/index.ts";
import { modelFilePath } from "../models/lock.ts";
import type { JapaneseDictionary } from "../terms/interfaces/index.ts";
import { loadJmdict } from "../terms/jmdict.ts";

const dictionaryModelId = "jmdict";

/** The locked JMdict under the data root, its forms cached by the file's checksum so a new snapshot is read afresh. */
export const openJapaneseDictionary = (paths: DataPaths, lock: ModelsLock): JapaneseDictionary => {
  const model = lock.models[dictionaryModelId];
  if (!model) throw new Error(`models.lock.json has no "${dictionaryModelId}" entry`);
  const file = model.files[0]!;
  return loadJmdict(modelFilePath(paths.models, dictionaryModelId, file.path), join(paths.cache, `jmdict-forms-${file.sha256.slice(0, 12)}.txt`));
};
