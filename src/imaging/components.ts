import type { ComponentStats } from "./interfaces/index.ts";

const find = (parent: Int32Array, label: number) => {
  let root = label;
  while (parent[root] !== root) root = parent[root]!;
  while (parent[label] !== root) {
    const next = parent[label]!;
    parent[label] = root;
    label = next;
  }
  return root;
};

const unite = (parent: Int32Array, a: number, b: number) => {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) {
    parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  }
};

/**
 * Two-pass union-find labelling with 8-connectivity (the connectivity of OpenCV contours, which DB
 * post-processing is defined on). Returns per-pixel labels (0 = background) and per-component stats.
 */
export const labelComponents = (mask: Uint8Array, width: number, height: number) => {
  const labels = new Int32Array(width * height);
  // Worst case is a checkerboard: one provisional label per two pixels.
  const parent = new Int32Array(Math.ceil((width * height) / 2) + 2);
  let next = 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const neighbours: number[] = [];
      if (x > 0 && labels[index - 1]) neighbours.push(labels[index - 1]!);
      if (y > 0) {
        const above = index - width;
        if (x > 0 && labels[above - 1]) neighbours.push(labels[above - 1]!);
        if (labels[above]) neighbours.push(labels[above]!);
        if (x < width - 1 && labels[above + 1]) neighbours.push(labels[above + 1]!);
      }
      if (neighbours.length === 0) {
        parent[next] = next;
        labels[index] = next;
        next += 1;
        continue;
      }
      const smallest = Math.min(...neighbours);
      labels[index] = smallest;
      for (const label of neighbours) unite(parent, smallest, label);
    }
  }

  const compact = new Int32Array(next);
  const stats: ComponentStats[] = [];
  const rowSpans = new Map<number, Map<number, [number, number]>>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!labels[index]) continue;
      const root = find(parent, labels[index]!);
      let label = compact[root]!;
      if (!label) {
        label = stats.length + 1;
        compact[root] = label;
        stats.push({ label, pixels: 0, box: { x0: x, y0: y, x1: x + 1, y1: y + 1 }, rows: [] });
        rowSpans.set(label, new Map());
      }
      labels[index] = label;
      const component = stats[label - 1]!;
      component.pixels += 1;
      component.box.x0 = Math.min(component.box.x0, x);
      component.box.x1 = Math.max(component.box.x1, x + 1);
      component.box.y1 = Math.max(component.box.y1, y + 1);
      const spans = rowSpans.get(label)!;
      const span = spans.get(y);
      if (span) {
        span[1] = x;
      } else {
        spans.set(y, [x, x]);
      }
    }
  }
  for (const component of stats) {
    component.rows = [...rowSpans.get(component.label)!].map(([row, [min, max]]) => [row, min, max]);
  }
  return { labels, components: stats };
};

/** Hull input for a component: the pixel corners at both ends of every row. */
export const componentCornerPoints = (component: ComponentStats) =>
  component.rows.flatMap(([row, min, max]) => [
    { x: min, y: row },
    { x: min, y: row + 1 },
    { x: max + 1, y: row },
    { x: max + 1, y: row + 1 },
  ]);
