import type { PageRecord } from "../../db/interfaces/page-record.ts";
import type { VolumeSummary } from "./volume-summary.ts";

export interface VolumeDetail extends VolumeSummary {
  pages: {
    ordinal: number;
    kind: PageRecord["kind"];
    width: number;
    height: number;
    /** The translated page image exists. */
    translated: boolean;
    openFlags: { warn: number; error: number };
  }[];
}
