import type { buildGlossary } from "../build-glossary.ts";

/** Result of the S7 barrier as stored for a volume: fixed terms, conflicts and the frozen glossary. */
export type VolumeGlossary = Awaited<ReturnType<typeof buildGlossary>>;
