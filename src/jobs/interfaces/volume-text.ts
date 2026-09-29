import type { VolumePageText } from "../../pipeline/interfaces/index.ts";
import type { SourceLanguage } from "../../translate/interfaces/index.ts";

/** Every page's translatable text in reading order, fixed when the glossary stage runs. */
export interface VolumeText {
  language: SourceLanguage;
  direction: "rtl" | "ltr";
  pages: VolumePageText[];
}
