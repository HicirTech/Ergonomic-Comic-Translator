/** One utterance to translate. `id` is the region's reading order, plus a letter when a bubble was split. */
export interface TranslationUnit {
  id: string;
  kind: "dialogue" | "thought" | "narration" | "free_text" | "sfx" | "name_tag";
  source: string;
  /** Speaker hint such as a name tag; omitted when unknown. */
  speaker?: string;
}
