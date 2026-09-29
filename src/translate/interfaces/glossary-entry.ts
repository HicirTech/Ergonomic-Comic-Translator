/** A frozen volume term: how a name or term is always translated, with an optional note (role, gender). */
export interface GlossaryEntry {
  source: string;
  target: string;
  note?: string;
}
