/** Stages of a translate_volume job, in dependency order. */
export type VolumeStage = "vision" | "glossary" | "translate" | "render" | "export";
