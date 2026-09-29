/** Named groups of model ids from models.lock.json that are installed together. */
export const modelPacks: Record<string, readonly string[]> = {
  vision: [
    "detector",
    "ppocr-det-mobile",
    "ppocr-rec-server",
    "textline-ori",
    "manga-ocr",
    "manga-ocr-vocab",
    "baberu-ocr",
    "lama-manga",
    "migan",
  ],
  korean: ["ppocr-rec-korean"],
  // T2 is the default tier on a large card; T1 is the fallback while another application holds VRAM.
  llm: ["qwen3.5-9b-q6k", "qwen3.5-9b-q4km"],
  "llm-small": ["qwen3.5-9b-iq3xxs", "hy-mt2-7b-q4km"],
};

/** Expands pack names and model ids, keeping the first occurrence of each id. */
export const expandModelSelection = (names: readonly string[]) => {
  const ids = names.flatMap((name) => modelPacks[name] ?? [name]);
  return [...new Set(ids)];
};
