import type { StageContext } from "./stage-context.ts";

/** Runs one task of a stage and returns the content key of what it wrote (null when nothing is keyed). */
export type StageRun = (context: StageContext) => Promise<string | null>;
