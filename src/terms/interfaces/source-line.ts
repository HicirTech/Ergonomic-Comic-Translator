/** One utterance of the volume as the term stages see it; `id` is "page.region.utterance". */
export interface SourceLine {
  id: string;
  page: number;
  text: string;
  /** The utterance is a speaker label (name tag) found by the splitter. */
  nameTag: boolean;
}
