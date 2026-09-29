import { canonicalJson } from "./canonical-json.ts";
import { sha256Hex } from "./hash.ts";

/**
 * Content-addressed key for a stage output: sha256 of the canonical JSON of everything that
 * determines the output (stage, implementation version, model sha256, runtime, parameters, input keys).
 */
export const cacheKey = (parts: Record<string, unknown>) => sha256Hex(canonicalJson(parts));

/** Deterministic 31-bit sampling seed derived from a cache key, so a re-run reproduces the first result. */
export const seedFromKey = (key: string) => Number.parseInt(key.slice(0, 8), 16) & 0x7fffffff;
