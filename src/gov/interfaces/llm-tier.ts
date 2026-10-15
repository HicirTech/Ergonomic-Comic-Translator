import type { ContractId } from "../../translate/interfaces/index.ts";

/** A translation-model tier: which locked model, on which kind of device, speaking which contract. */
export interface LlmTier {
  id: string;
  label: string;
  /** Key in models.lock.json. */
  modelId: string;
  device: "gpu" | "cpu";
  /** Opt-in tiers are never chosen automatically. */
  optIn: boolean;
  /** How the tier's model is asked and read. */
  contract: ContractId;
}
