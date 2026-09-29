import type { TermKind } from "./term-kind.ts";

/** One entity the model reported for a chunk (term-extract@1), after validation against the chunk's lines. */
export interface ExtractedEntity {
  src: string;
  kind: TermKind;
  base?: string;
  honorific?: string;
  aliasOf?: string;
  gender?: "m" | "f" | "x" | "unknown";
  evidence: string[];
}
