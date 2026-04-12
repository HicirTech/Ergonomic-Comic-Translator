/**
 * Detect the speech-bubble boundary around a polygon and return a new polygon
 * snapped to the inner edge of the bubble with a configurable inset.
 *
 * Uses the textless page image (text already removed) so that inpainted text
 * doesn't interfere with boundary detection.
 *
 * Algorithm:
 * 1. Load the image and draw to an offscreen canvas.
 * 2. Flood-fill from the polygon centroid to find all connected light pixels
 *    (the bubble interior).
 * 3. Extract boundary pixels of the filled region.
 * 4. Order boundary pixels into a contour by angle from centroid.
 * 5. Simplify the contour with the Douglas-Peucker algorithm.
 * 6. Inset each vertex by `insetPx` toward the centroid.
 */

const BRIGHTNESS_THRESHOLD = 170;
const MAX_FLOOD_PIXELS = 800_000; // safety cap to avoid flooding the entire page

/** Perceived luminance (0–255) at pixel (x, y). Returns 0 for out-of-bounds. */
function brightness(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const off = (y * w + x) * 4;
  return data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
}

/** Load an image from a URL. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Scanline flood-fill from (sx, sy). Returns a Uint8Array mask where 1 = filled.
 * Only fills pixels whose brightness >= threshold.
 */
function floodFill(
  data: Uint8ClampedArray, w: number, h: number,
  sx: number, sy: number, threshold: number,
): Uint8Array | null {
  const mask = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  let count = 0;

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (mask[idx]) continue;
    if (brightness(data, w, h, x, y) < threshold) continue;

    mask[idx] = 1;
    count++;
    if (count > MAX_FLOOD_PIXELS) return null; // region too large, likely not a bubble

    stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
  }

  return mask;
}

/**
 * Extract boundary pixels from a flood-fill mask.
 * A pixel is on the boundary if it's filled and has at least one unfilled 4-neighbor.
 */
function extractBoundary(mask: Uint8Array, w: number, h: number): [number, number][] {
  const boundary: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      // Check 4-neighbors
      if (
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !mask[y * w + (x - 1)] || !mask[y * w + (x + 1)] ||
        !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x]
      ) {
        boundary.push([x, y]);
      }
    }
  }
  return boundary;
}

/**
 * Order boundary points by angle from the centroid, then average nearby points
 * into angular buckets to produce a clean, ordered contour.
 */
function buildContour(
  boundary: [number, number][],
  cx: number, cy: number,
  bucketCount: number,
): [number, number][] {
  // For each angular bucket, track the point furthest from centroid
  const buckets: ([number, number] | null)[] = new Array(bucketCount).fill(null);
  const bucketDist: number[] = new Array(bucketCount).fill(0);

  for (const [bx, by] of boundary) {
    const angle = Math.atan2(by - cy, bx - cx); // -PI..PI
    const bucket = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * bucketCount) % bucketCount;
    const dist = (bx - cx) ** 2 + (by - cy) ** 2;
    if (dist > bucketDist[bucket]) {
      buckets[bucket] = [bx, by];
      bucketDist[bucket] = dist;
    }
  }

  // Collect non-empty buckets in order
  const contour: [number, number][] = [];
  for (const pt of buckets) {
    if (pt) contour.push(pt);
  }
  return contour;
}

// ── Douglas-Peucker simplification ──────────────────────────────────────────

function perpendicularDist(pt: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq));
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}

function douglasPeucker(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/**
 * Simplify a closed polygon using Douglas-Peucker.
 * Handles the wrap-around by doubling, simplifying, then trimming.
 */
function simplifyClosedPolygon(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 4) return points;
  // Double the points so the algorithm handles the wrap-around seam
  const doubled = [...points, ...points];
  const simplified = douglasPeucker(doubled, epsilon);
  // Take approximately the first half (original range)
  const n = Math.ceil(simplified.length / 2);
  return simplified.slice(0, n);
}

/**
 * Given an image URL and a polygon, detect the surrounding speech bubble
 * and return a new polygon snapped to the bubble interior with `insetPx` padding.
 *
 * Returns `null` if detection fails.
 */
export async function detectBubbleBoundary(
  imageUrl: string,
  polygon: [number, number][],
  insetPx = 5,
): Promise<[number, number][] | null> {
  if (polygon.length < 3) return null;

  let img: HTMLImageElement;
  try {
    img = await loadImage(imageUrl);
  } catch {
    return null;
  }

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  // Compute centroid of the input polygon
  let cx = 0, cy = 0;
  for (const [px, py] of polygon) { cx += px; cy += py; }
  cx = Math.round(cx / polygon.length);
  cy = Math.round(cy / polygon.length);

  // Verify centroid is inside a light area
  if (brightness(data, w, h, cx, cy) < BRIGHTNESS_THRESHOLD) {
    return null;
  }

  // Flood-fill from centroid to find the bubble interior
  const mask = floodFill(data, w, h, cx, cy, BRIGHTNESS_THRESHOLD);
  if (!mask) return null; // region too large

  // Extract boundary pixels
  const boundary = extractBoundary(mask, w, h);
  if (boundary.length < 10) return null;

  // Build ordered contour using angular buckets (360 buckets = 1° resolution)
  const contour = buildContour(boundary, cx, cy, 360);
  if (contour.length < 4) return null;

  // Simplify the contour — epsilon based on the bubble size
  // Compute approximate radius for adaptive epsilon
  let maxR = 0;
  for (const [px, py] of contour) {
    const r = Math.hypot(px - cx, py - cy);
    if (r > maxR) maxR = r;
  }
  const epsilon = Math.max(2, maxR * 0.02); // ~2% of bubble radius, min 2px
  const simplified = simplifyClosedPolygon(contour, epsilon);
  if (simplified.length < 3) return null;

  // Inset each vertex toward the centroid by `insetPx`
  const result: [number, number][] = simplified.map(([px, py]) => {
    const vx = px - cx;
    const vy = py - cy;
    const dist = Math.sqrt(vx * vx + vy * vy);
    if (dist < insetPx * 2) return [px, py];
    const scale = (dist - insetPx) / dist;
    return [cx + vx * scale, cy + vy * scale] as [number, number];
  });

  return result;
}
