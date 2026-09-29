import type { TermKind } from "./term-kind.ts";

/** S7c output: one name or term with all its surface forms and vote counts. */
export interface MergedTerm {
  normKey: string;
  canonical: string;
  kind: TermKind | "address";
  surfaces: string[];
  /** Chunks that reported it. */
  votes: number;
  occurrences: number;
  firstPage: number;
  /** Gender votes by chunk. */
  genderVotes: Record<"m" | "f" | "x", number>;
  /** For address entries: the honorific that follows the base name. */
  honorific?: string;
  /** Other terms this one is a part of (full name -> given name). */
  partOf: string[];
}
