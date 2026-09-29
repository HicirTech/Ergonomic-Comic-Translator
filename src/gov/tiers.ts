import type { ModelsLock } from "../models/interfaces/index.ts";
import { estimateCpuLlm, estimateGpuLlm, visionResidentBytes } from "./footprint-estimate.ts";
import type { AdapterKind, LlmTier, TierFit } from "./interfaces/index.ts";

/** Candidate tiers per adapter kind, best first. The 35B tiers (T3-T5) are opt-in and not locked yet. */
export const tierCandidates: Record<AdapterKind, readonly LlmTier[]> = {
  discrete: [
    { id: "T2", label: "Qwen3.5-9B Q6_K", modelId: "qwen3.5-9b-q6k", device: "gpu", optIn: false },
    { id: "T1", label: "Qwen3.5-9B Q4_K_M", modelId: "qwen3.5-9b-q4km", device: "gpu", optIn: false },
    { id: "T0", label: "Qwen3.5-9B UD-IQ3_XXS", modelId: "qwen3.5-9b-iq3xxs", device: "gpu", optIn: false },
  ],
  // Order before measurement on the 8845HS: Hy-MT2-7B Q4 > Qwen3.5-9B Q4 (if it fits) > IQ3_XXS.
  uma: [
    { id: "iG-8", label: "Hy-MT2-7B Q4_K_M", modelId: "hy-mt2-7b-q4km", device: "gpu", optIn: false },
    { id: "iG-8q", label: "Qwen3.5-9B Q4_K_M", modelId: "qwen3.5-9b-q4km", device: "gpu", optIn: false },
    { id: "iG-8s", label: "Qwen3.5-9B UD-IQ3_XXS", modelId: "qwen3.5-9b-iq3xxs", device: "gpu", optIn: false },
  ],
  unsupported: [],
};

export const cpuTier: LlmTier = { id: "C0", label: "Qwen3.5-9B Q4_K_M (CPU)", modelId: "qwen3.5-9b-q4km", device: "cpu", optIn: false };

const modelBytes = (lock: ModelsLock, modelId: string) => {
  const model = lock.models[modelId];
  if (!model) {
    throw new Error(`Tier references "${modelId}", which models.lock.json does not contain`);
  }
  return model.files.reduce((sum, file) => sum + file.size, 0);
};

/** Estimated fit of every candidate for one adapter budget and the RAM a load may take. */
export const fitTiers = (
  lock: ModelsLock,
  kind: AdapterKind,
  deviceAvailableBytes: number,
  hostAvailableBytes: number,
): TierFit[] => {
  const gpuFits = tierCandidates[kind].map((tier): TierFit => {
    const estimate = estimateGpuLlm(modelBytes(lock, tier.modelId));
    const hostOk = estimate.hostPrivateBytes <= hostAvailableBytes;
    const fit = !hostOk
      ? "no"
      : estimate.devBytes + visionResidentBytes <= deviceAvailableBytes
        ? "resident"
        : estimate.devBytes <= deviceAvailableBytes ? "timeshare" : "no";
    return { tier, ...estimate, fit };
  });
  const cpuEstimate = estimateCpuLlm(modelBytes(lock, cpuTier.modelId));
  const cpuFit: TierFit = {
    tier: cpuTier,
    ...cpuEstimate,
    fit: cpuEstimate.hostPrivateBytes <= hostAvailableBytes ? "timeshare" : "no",
  };
  return [...gpuFits, cpuFit];
};

/**
 * Best-quality non-opt-in GPU tier that fits at all (time-sharing with vision is only slower, a smaller model
 * is worse), else the CPU tier. Candidates are ordered best first.
 */
export const recommendTier = (fits: readonly TierFit[]) =>
  fits.find((fit) => !fit.tier.optIn && fit.tier.device === "gpu" && fit.fit !== "no")
  ?? fits.find((fit) => fit.tier.device === "cpu" && fit.fit !== "no")
  ?? null;
