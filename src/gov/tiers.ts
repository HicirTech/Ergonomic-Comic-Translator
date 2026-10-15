import type { ModelsLock } from "../models/interfaces/index.ts";
import type { SourceLanguage } from "../translate/interfaces/index.ts";
import { estimateCpuLlm, estimateGpuLlm, visionResidentBytes } from "./footprint-estimate.ts";
import type { AdapterKind, LlmRole, LlmTier, TierFit } from "./interfaces/index.ts";

/** Candidate tiers per adapter kind, best first. The 35B tiers (T3-T5) are opt-in and not locked yet. */
export const tierCandidates: Record<AdapterKind, readonly LlmTier[]> = {
  discrete: [
    { id: "T2", label: "Qwen3.5-9B Q6_K", modelId: "qwen3.5-9b-q6k", device: "gpu", optIn: false, contract: "json" },
    { id: "T1", label: "Qwen3.5-9B Q4_K_M", modelId: "qwen3.5-9b-q4km", device: "gpu", optIn: false, contract: "json" },
    { id: "T0", label: "Qwen3.5-9B UD-IQ3_XXS", modelId: "qwen3.5-9b-iq3xxs", device: "gpu", optIn: false, contract: "json" },
  ],
  // Order before measurement on the 8845HS: Hy-MT2-7B Q4 > Qwen3.5-9B Q4 (if it fits) > IQ3_XXS.
  uma: [
    { id: "iG-8", label: "Hy-MT2-7B Q4_K_M", modelId: "hy-mt2-7b-q4km", device: "gpu", optIn: false, contract: "json" },
    { id: "iG-8q", label: "Qwen3.5-9B Q4_K_M", modelId: "qwen3.5-9b-q4km", device: "gpu", optIn: false, contract: "json" },
    { id: "iG-8s", label: "Qwen3.5-9B UD-IQ3_XXS", modelId: "qwen3.5-9b-iq3xxs", device: "gpu", optIn: false, contract: "json" },
  ],
  unsupported: [],
};

export const cpuTier: LlmTier = { id: "C0", label: "Qwen3.5-9B Q4_K_M (CPU)", modelId: "qwen3.5-9b-q4km", device: "cpu", optIn: false, contract: "json" };

/** Tried first for Japanese volumes: the Sakura line model, found more accurate than the general tiers on them. */
const japaneseTierCandidates: Record<AdapterKind, readonly LlmTier[]> = {
  discrete: [{ id: "J2", label: "Sakura-14B-Qwen2.5-v1.0 Q4_K_M", modelId: "sakura-14b-q4km", device: "gpu", optIn: false, contract: "sakura" }],
  uma: [],
  unsupported: [],
};

/** Candidates for one role, best first: the Japanese translator where the adapter kind has one, then the general tiers. */
export const tierCandidatesFor = (kind: AdapterKind, role: LlmRole) =>
  role === "japanese" ? [...japaneseTierCandidates[kind], ...tierCandidates[kind]] : tierCandidates[kind];

/** The translator for a volume's language; names and terms always use the general model. */
export const llmRoleFor = (language: SourceLanguage): LlmRole => (language === "ja" ? "japanese" : "general");

const modelBytes = (lock: ModelsLock, modelId: string) => {
  const model = lock.models[modelId];
  if (!model) {
    throw new Error(`Tier references "${modelId}", which models.lock.json does not contain`);
  }
  return model.files.reduce((sum, file) => sum + file.size, 0);
};

/** Estimated fit of every candidate of one role for one adapter budget and the RAM a load may take. */
export const fitTiers = (
  lock: ModelsLock,
  kind: AdapterKind,
  deviceAvailableBytes: number,
  hostAvailableBytes: number,
  role: LlmRole = "general",
): TierFit[] => {
  const gpuFits = tierCandidatesFor(kind, role).map((tier): TierFit => {
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
