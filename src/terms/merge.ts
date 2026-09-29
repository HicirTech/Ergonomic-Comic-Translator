import type { ExtractedEntity, MergedTerm, SourceLine, TermKind } from "./interfaces/index.ts";
import { normKey, splitHonorific } from "./norm-key.ts";

/** Non-person kinds need this much support; a person with evidence is kept even if seen once. */
const minSupport = 2;
/** A (name, honorific) pair used this often becomes an address term with a fixed Chinese form. */
const addressMinUses = 2;

const pageOf = (lineId: string) => Number(lineId.split(".")[0]);

/** Occurrences of a surface in the volume, counted on normalised text. */
const countOccurrences = (lines: readonly SourceLine[], surface: string) => {
  let count = 0;
  for (const line of lines) {
    const text = line.text.normalize("NFKC");
    for (let index = text.indexOf(surface); index >= 0; index = text.indexOf(surface, index + surface.length)) count += 1;
  }
  return count;
};

/**
 * S7c: merges per-chunk entities into terms by normalised key (same key, or alias_of pointing at an
 * existing term), counts votes per chunk, decides kind by votes (ties favour person), and keeps a person
 * seen once while other kinds need two votes or occurrences. Full names split on "・" or spaces link their
 * parts. (name, honorific) pairs used at least twice become address terms.
 */
export const mergeEntities = (chunks: readonly ExtractedEntity[][], lines: readonly SourceLine[]): MergedTerm[] => {
  const terms = new Map<string, MergedTerm & { kindVotes: Map<TermKind, number> }>();
  const addressUses = new Map<string, { base: string; honorific: string; surface: string; uses: number; firstPage: number }>();

  chunks.forEach((entities) => {
    const seenThisChunk = new Set<string>();
    for (const entity of entities) {
      const base = entity.base ?? splitHonorific(entity.src).base;
      const honorific = entity.honorific ?? splitHonorific(entity.src).honorific;
      let key = normKey(base);
      const aliasKey = entity.aliasOf ? normKey(entity.aliasOf) : null;
      if (aliasKey && terms.has(aliasKey) && !terms.has(key)) key = aliasKey;

      const firstPage = Math.min(...entity.evidence.map(pageOf));
      const term = terms.get(key) ?? {
        normKey: key,
        canonical: base,
        kind: entity.kind,
        surfaces: [],
        votes: 0,
        occurrences: 0,
        firstPage,
        genderVotes: { m: 0, f: 0, x: 0 },
        partOf: [],
        kindVotes: new Map<TermKind, number>(),
      };
      if (!term.surfaces.includes(entity.src)) term.surfaces.push(entity.src);
      if (!term.surfaces.includes(base)) term.surfaces.push(base);
      term.firstPage = Math.min(term.firstPage, firstPage);
      if (!seenThisChunk.has(key)) {
        seenThisChunk.add(key);
        term.votes += 1;
        term.kindVotes.set(entity.kind, (term.kindVotes.get(entity.kind) ?? 0) + 1);
        if (entity.gender && entity.gender !== "unknown") term.genderVotes[entity.gender] += 1;
      }
      terms.set(key, term);

      if (honorific) {
        const addressKey = `${key}+${honorific}`;
        const use = addressUses.get(addressKey) ?? { base, honorific, surface: `${base}${honorific}`, uses: 0, firstPage };
        use.uses += 1;
        use.firstPage = Math.min(use.firstPage, firstPage);
        addressUses.set(addressKey, use);
      }
    }
  });

  const merged: MergedTerm[] = [];
  for (const term of terms.values()) {
    const ranked = [...term.kindVotes].sort((a, b) => b[1] - a[1] || (a[0] === "person" ? -1 : b[0] === "person" ? 1 : 0));
    const kind = ranked[0]![0];
    const occurrences = Math.max(...term.surfaces.map((surface) => countOccurrences(lines, surface.normalize("NFKC"))));
    const { kindVotes: _, ...rest } = term;
    const candidate: MergedTerm = { ...rest, kind, occurrences };
    if (kind === "person" || candidate.votes >= minSupport || occurrences >= minSupport) merged.push(candidate);
  }

  // Full names link to their parts ("リン・ハート" -> "リン", "ハート").
  for (const term of merged) {
    const parts = term.canonical.split(/[・\s]/u).filter((part) => [...part].length >= 2);
    if (parts.length < 2) continue;
    for (const part of parts) {
      const partTerm = merged.find((candidate) => candidate.normKey === normKey(part));
      if (partTerm && !partTerm.partOf.includes(term.normKey)) partTerm.partOf.push(term.normKey);
    }
  }

  for (const [addressKey, use] of addressUses) {
    if (use.uses < addressMinUses || !merged.some((term) => term.normKey === addressKey.split("+")[0])) continue;
    merged.push({
      normKey: addressKey,
      canonical: use.surface,
      kind: "address",
      surfaces: [use.surface],
      votes: use.uses,
      occurrences: countOccurrences(lines, use.surface.normalize("NFKC")),
      firstPage: use.firstPage,
      genderVotes: { m: 0, f: 0, x: 0 },
      honorific: use.honorific,
      partOf: [],
    });
  }
  return merged.sort((a, b) => a.firstPage - b.firstPage || b.occurrences - a.occurrences);
};
