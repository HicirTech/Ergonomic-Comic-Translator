import { canonicalJson } from "../core/canonical-json.ts";
import { sha256Hex } from "../core/hash.ts";
import type { GlossaryEntry } from "../translate/interfaces/index.ts";
import type { FixedTerm } from "./interfaces/index.ts";

/** Role-table entries need at least this many occurrences (rarer names are injected per page instead). */
const roleTableMinOccurrences = 2;

const originRank = (term: FixedTerm) => (term.locked ? 0 : term.origin === "user" ? 1 : term.origin === "series" ? 2 : 3);

/**
 * S7e: resolves duplicates of the same key (locked > user > series > automatic; among automatic entries
 * more votes win, ties keep the first occurrence, never the latest write) and reports people who ended up
 * with the same Chinese name. Conflicts never stop the job; they become TERM_CONFLICT flags.
 */
export const resolveTerms = (terms: readonly FixedTerm[]) => {
  const byKey = new Map<string, FixedTerm>();
  const firstPages = new Map<string, number>();
  for (const term of terms) {
    firstPages.set(term.normKey, Math.min(firstPages.get(term.normKey) ?? Infinity, term.firstPage));
    const current = byKey.get(term.normKey);
    const better = !current
      || originRank(term) < originRank(current)
      || (originRank(term) === originRank(current) && (term.votes > current.votes || (term.votes === current.votes && term.firstPage < current.firstPage)));
    if (better) byKey.set(term.normKey, term);
  }
  const resolved = [...byKey.values()]
    .map((term) => ({ ...term, firstPage: firstPages.get(term.normKey)! }))
    .sort((a, b) => a.firstPage - b.firstPage);
  const people = resolved.filter((term) => term.kind === "person");
  const conflicts = people.flatMap((term, index) =>
    people.slice(index + 1).filter((other) => other.target === term.target).map((other) => [term.normKey, other.normKey] as const));
  return { terms: resolved, conflicts };
};

const noteOf = (term: FixedTerm) => {
  const gender = term.gender === "m" ? "男" : term.gender === "f" ? "女" : "";
  return [gender, term.noteZh].filter(Boolean).join("，");
};

/** Frozen glossary for a volume run: the stable role table and a content hash every request cites. */
export const freezeGlossary = (terms: readonly FixedTerm[]) => {
  const roleTable: GlossaryEntry[] = terms
    .filter((term) => term.kind === "person" && term.occurrences >= roleTableMinOccurrences)
    .map((term) => ({ source: term.canonical, target: term.target, ...(noteOf(term) ? { note: noteOf(term) } : {}) }));
  const entries = terms.map((term) => ({ surfaces: term.surfaces, target: term.target, kind: term.kind, note: noteOf(term) }));
  return { roleTable, entries, sha256: sha256Hex(canonicalJson({ roleTable, entries })) };
};
