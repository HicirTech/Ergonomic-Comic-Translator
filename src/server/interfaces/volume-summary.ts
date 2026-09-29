import type { JobSummary } from "../../db/interfaces/job-summary.ts";
import type { SourceLanguage } from "../../translate/interfaces/source-language.ts";

/** A volume as the library lists it. */
export interface VolumeSummary {
  id: string;
  title: string;
  /** null until detected from the text (the first job does that). */
  sourceLanguage: SourceLanguage | null;
  readingDirection: "rtl" | "ltr" | null;
  createdAt: string;
  pageCount: number;
  /** The latest job; `expected` is how many tasks the whole volume takes, for a progress bar. */
  job: { id: string; state: JobSummary["state"]; done: number; failed: number; expected: number } | null;
  openFlags: { warn: number; error: number };
  exports: { cbz: boolean; pdf: boolean };
}
