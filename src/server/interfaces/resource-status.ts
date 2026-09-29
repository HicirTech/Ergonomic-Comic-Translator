import type { Light } from "../../gov/interfaces/light.ts";

/** The governor as the UI shows it: one light, Chinese reasons, and the room left on each adapter. */
export interface ResourceStatus {
  light: Light;
  lightZh: string;
  reasonsZh: string[];
  /** Which models are loaded now. */
  loaded: "gpu" | "llm" | null;
  adapters: {
    name: string;
    kindZh: string;
    totalBytes: number;
    /** What a new load may still take after the headroom kept for other programs. */
    availableBytes: number;
    /** GPU utilisation of other programs, null when unknown. */
    externalUtilPct: number | null;
  }[];
}
