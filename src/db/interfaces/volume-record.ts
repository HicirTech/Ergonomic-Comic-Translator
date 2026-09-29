import type { SourceLanguage } from "../../translate/interfaces/index.ts";

export interface VolumeRecord {
  id: string;
  title: string;
  /** NULL until the user picks it or it is detected from the recognised text. */
  source_lang: SourceLanguage | null;
  lang_confidence: number | null;
  reading_direction: "rtl" | "ltr" | null;
  created_at: string;
}
