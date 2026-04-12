/**
 * Detect the speech-bubble boundary around a polygon and return a new polygon
 * snapped to the inner edge of the bubble with a configurable inset.
 *
 * Algorithm:
 * 1. Draw the page image to an offscreen canvas and extract pixel data.
 * 2. From the polygon centroid, cast rays at regular angular intervals.
 * 3. Walk each ray outward until hitting a "dark" pixel (the bubble outline).
 * 4. Collect all boundary points and compute their convex hull.
 * 5. Inset each hull vertex by `insetPx` toward the centroid.
 */

const EDGE_BRIGHTNESS_THRESHOLD = 180; // pixels darker than this are considered "edge"
const RAY_STEP = 1;                    // pixels per step along each ray
const RAY_COUNT = 72;                  // number of rays (every 5°)
const MAX_RAY_LENGTH = 600;            // max pixels to walk per ray

/**
 * Get brightness (0–255) at (x, y) from an ImageData buffer.
 * Returns 0 for out-of-bounds coordinates.
 */
function brightness(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) return 0;
  const off = (iy * w + ix) * 4;
  // Perceived luminance (fast approx)
  return data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
}

/**
 * Given an image element and a polygon, detect the surrounding speech bubble
 * and return a new polygon snapped to the bubble interior with `insetPx` padding.
 *
 * Returns `null` if detection fails (e.g. image not loaded, polygon invalid).
 */
export function detectBubbleBoundary(
  img: HTMLImageElement,
  polygon: [number, number][],
  insetPx = 5,
): [number, number][] | null {
  if (!img.complete || img.naturalWidth === 0) return null;
  if (polygon.length < 3) return null;

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // Create offscreen canvas and draw image
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  // Compute centroid
  let cx = 0, cy = 0;
  for (const [px, py] of polygon) { cx += px; cy += py; }
  cx /= polygon.length;
  cy /= polygon.length;

  // Verify centroid is in a "light" area (inside a bubble)
  if (brightness(data, w, h, cx, cy) < EDGE_BRIGHTNESS_THRESHOLD) {
    // Centroid is on a dark area — not a typical white bubble, bail
    return null;
  }

  // Cast rays from centroid and find boundary points
  const boundaryPoints: [number, number][] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (2 * Math.PI * i) / RAY_COUNT;
    const dx = Math.cos(angle) * RAY_STEP;
    const dy = Math.sin(angle) * RAY_STEP;

    let x = cx;
    let y = cy;
    let found = false;

    for (let step = 0; step < MAX_RAY_LENGTH / RAY_STEP; step++) {
      x += dx;
      y += dy;

      // Out of image bounds — treat as boundary
      if (x < 0 || y < 0 || x >= w || y >= h) {
        boundaryPoints.push([x - dx, y - dy]);
        found = true;
        break;
      }

      const b = brightness(data, w, h, x, y);
      if (b < EDGE_BRIGHTNESS_THRESHOLD) {
        // Hit a dark pixel — this is the bubble edge
        boundaryPoints.push([x, y]);
        found = true;
        break;
      }
    }

    if (!found) {
      // Ray maxed out without hitting an edge
      boundaryPoints.push([x, y]);
    }
  }

  if (boundaryPoints.length < 3) return null;

  // Compute convex hull of boundary points (Andrew's monotone chain)
  const hull = convexHull(boundaryPoints);
  if (hull.length < 3) return null;

  // Inset each hull vertex toward the centroid by `insetPx`
  const insetHull: [number, number][] = hull.map(([px, py]) => {
    const vx = px - cx;
    const vy = py - cy;
    const dist = Math.sqrt(vx * vx + vy * vy);
    if (dist < insetPx * 2) return [px, py]; // too close to centre, don't inset
    const scale = (dist - insetPx) / dist;
    return [cx + vx * scale, cy + vy * scale] as [number, number];
  });

  return insetHull;
}

// ── Convex hull (Andrew's monotone chain) ────────────────────────────────────

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: [number, number][]): [number, number][] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
