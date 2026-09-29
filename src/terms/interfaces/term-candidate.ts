import type { TermSignal } from "./term-signal.ts";

/** S7a output: a possible name or term found by rules alone. */
export interface TermCandidate {
  normKey: string;
  surfaces: string[];
  pages: number[];
  count: number;
  signals: TermSignal[];
}
