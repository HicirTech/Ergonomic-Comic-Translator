import type { Point } from "./interfaces/index.ts";

/**
 * Sets every pixel whose centre lies inside a convex quad (any winding) in a row-major mask.
 * Only the quad's bounding box is visited.
 */
export const rasterizeConvexQuad = (mask: Uint8Array, width: number, height: number, quad: readonly Point[], value = 1) => {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const edges = quad.map((a, index) => {
    const b = quad[(index + 1) % quad.length]!;
    return { ax: a.x, ay: a.y, dx: b.x - a.x, dy: b.y - a.y };
  });
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let positive = false;
      let negative = false;
      for (const edge of edges) {
        const cross = edge.dx * (py - edge.ay) - edge.dy * (px - edge.ax);
        if (cross > 0) positive = true;
        else if (cross < 0) negative = true;
      }
      if (!(positive && negative)) mask[y * width + x] = value;
    }
  }
};
