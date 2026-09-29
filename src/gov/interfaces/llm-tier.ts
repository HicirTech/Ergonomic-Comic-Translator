/** A translation-model tier: which locked model, on which kind of device. */
export interface LlmTier {
  id: string;
  label: string;
  /** Key in models.lock.json. */
  modelId: string;
  device: "gpu" | "cpu";
  /** Opt-in tiers are never chosen automatically. */
  optIn: boolean;
}
