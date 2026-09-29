import type { MergedTerm } from "./merged-term.ts";

/** S7d output: a merged term with its fixed Chinese rendering. */
export interface FixedTerm extends MergedTerm {
  target: string;
  /** Accepted alternative renderings (nickname, family name alone, ...). */
  targetAliases: string[];
  gender: "m" | "f" | "x" | "unknown";
  noteZh: string;
  origin: "auto" | "user" | "series";
  locked: boolean;
}
