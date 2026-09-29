/** A surface form to find and the entry it stands for. */
interface Pattern<T> {
  surface: string;
  value: T;
}

interface Node<T> {
  next: Map<string, number>;
  fail: number;
  /** Patterns ending here, longest first. */
  outputs: Pattern<T>[];
}

/**
 * Aho-Corasick over NFKC text. `findAll` returns non-overlapping matches, preferring the longest
 * surface at each position (so "リン・ハート" wins over "リン").
 */
export const createMatcher = <T>(patterns: readonly Pattern<T>[]) => {
  const nodes: Node<T>[] = [{ next: new Map(), fail: 0, outputs: [] }];
  for (const pattern of patterns) {
    const surface = pattern.surface.normalize("NFKC");
    if (surface === "") continue;
    let state = 0;
    for (const char of surface) {
      let next = nodes[state]!.next.get(char);
      if (next === undefined) {
        next = nodes.length;
        nodes.push({ next: new Map(), fail: 0, outputs: [] });
        nodes[state]!.next.set(char, next);
      }
      state = next;
    }
    nodes[state]!.outputs.push({ surface, value: pattern.value });
  }
  const queue: number[] = [];
  for (const child of nodes[0]!.next.values()) queue.push(child);
  while (queue.length > 0) {
    const state = queue.shift()!;
    for (const [char, child] of nodes[state]!.next) {
      let fail = nodes[state]!.fail;
      while (fail !== 0 && !nodes[fail]!.next.has(char)) fail = nodes[fail]!.fail;
      const target = nodes[fail]!.next.get(char);
      nodes[child]!.fail = target !== undefined && target !== child ? target : 0;
      nodes[child]!.outputs.push(...nodes[nodes[child]!.fail]!.outputs);
      queue.push(child);
    }
  }
  for (const node of nodes) node.outputs.sort((a, b) => [...b.surface].length - [...a.surface].length);

  const findAll = (text: string) => {
    const chars = [...text.normalize("NFKC")];
    const raw: { start: number; end: number; value: T; surface: string }[] = [];
    let state = 0;
    chars.forEach((char, index) => {
      while (state !== 0 && !nodes[state]!.next.has(char)) state = nodes[state]!.fail;
      state = nodes[state]!.next.get(char) ?? 0;
      for (const output of nodes[state]!.outputs) {
        const length = [...output.surface].length;
        raw.push({ start: index - length + 1, end: index + 1, value: output.value, surface: output.surface });
      }
    });
    raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const kept: typeof raw = [];
    let cursor = 0;
    for (const match of raw) {
      if (match.start >= cursor) {
        kept.push(match);
        cursor = match.end;
      }
    }
    return kept;
  };
  return { findAll };
};
