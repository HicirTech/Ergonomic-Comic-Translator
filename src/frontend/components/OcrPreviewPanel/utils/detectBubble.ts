/**
 * Detect the speech-bubble boundary around a polygon and return a new polygon
 * snapped to the inner edge of the bubble with a configurable inset.
 *
 * Uses the textless page image (text already removed) so that inpainted text
 * doesn't interfere with boundary detection.
 *
 * Algorithm — gradient-based ray-casting:
 * 1. Load the image and compute a Sobel edge-magnitude map.
 * 2. Cast 360 rays from the polygon centroid outward.
 * 3. Walk each ray and stop when accumulated edge energy exceeds a threshold
 *    (adaptive, based on the image's median edge strength).
 * 4. Build an ordered contour from the hit points (angular buckets).
 * 5. Simplify the contour with Douglas-Peucker.
 * 6. Inset each vertex by `insetPx` toward the centroid.
 *
 * Works with both light and dark bubble backgrounds because it relies on
 * brightness *changes* (edges) rather than absolute brightness values.
 */

const RAY_COUNT = 360;
const RAY_STEP = 1;
const MAX_RAY_LENGTH = 800;
// How many consecutive boundary-flagged pixels must be hit before declaring a boundary
const BOUNDARY_RUN_LENGTH = 3;
// Color deviation threshold (Euclidean distance in RGB space)
const COLOR_DEVIATION_THRESHOLD = 45;

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
 * Compute Sobel edge magnitude for every pixel.
 * Returns a Float32Array of edge magnitudes (0–~1020).
 */
function computeEdgeMap(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    lum[i] = data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
  }

  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = lum[(y - 1) * w + (x - 1)];
      const tc = lum[(y - 1) * w + x];
      const tr = lum[(y - 1) * w + (x + 1)];
      const ml = lum[y * w + (x - 1)];
      const mr = lum[y * w + (x + 1)];
      const bl = lum[(y + 1) * w + (x - 1)];
      const bc = lum[(y + 1) * w + x];
      const br = lum[(y + 1) * w + (x + 1)];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      edge[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edge;
}

/**
 * Compute an adaptive edge threshold from the edge map.
 * Uses the edge values sampled along a ring around the centroid to determine
 * what constitutes a "strong" edge in this particular image region.
 */
function computeAdaptiveThreshold(
  edge: Float32Array, w: number, h: number,
  cx: number, cy: number, sampleRadius: number,
): number {
  const samples: number[] = [];
  for (let i = 0; i < 72; i++) {
    const angle = (2 * Math.PI * i) / 72;
    const x = Math.round(cx + Math.cos(angle) * sampleRadius);
    const y = Math.round(cy + Math.sin(angle) * sampleRadius);
    if (x >= 0 && y >= 0 && x < w && y < h) {
      samples.push(edge[y * w + x]);
    }
  }
  if (samples.length === 0) return 40;
  samples.sort((a, b) => a - b);
  // Use the 75th percentile of edge values in the local area as the threshold
  const p75 = samples[Math.floor(samples.length * 0.75)];
  // Clamp to a reasonable range
  return Math.max(25, Math.min(120, p75 * 1.5 + 15));
}

/**
 * Sample the average RGB color in a small area around (cx, cy).
 * Used as the "interior baseline color" for color-deviation boundary detection.
 */
function sampleInteriorColor(
  data: Uint8ClampedArray, w: number, h: number,
  cx: number, cy: number, radius = 8,
): [number, number, number] {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      const off = (y * w + x) * 4;
      rSum += data[off];
      gSum += data[off + 1];
      bSum += data[off + 2];
      count++;
    }
  }
  if (count === 0) return [128, 128, 128];
  return [rSum / count, gSum / count, bSum / count];
}

/** Euclidean distance between pixel at (x,y) and a reference RGB color. */
function colorDeviation(
  data: Uint8ClampedArray, w: number,
  x: number, y: number,
  refR: number, refG: number, refB: number,
): number {
  const off = (y * w + x) * 4;
  const dr = data[off] - refR;
  const dg = data[off + 1] - refG;
  const db = data[off + 2] - refB;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Order boundary points by angle into angular buckets.
 * For each bucket, keep the point closest to centroid (first edge hit).
 */
function buildContour(
  points: [number, number][],
  cx: number, cy: number,
  bucketCount: number,
): [number, number][] {
  const buckets: ([number, number] | null)[] = new Array(bucketCount).fill(null);

  for (const [bx, by] of points) {
    const angle = Math.atan2(by - cy, bx - cx);
    const bucket = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * bucketCount) % bucketCount;
    if (!buckets[bucket]) {
      buckets[bucket] = [bx, by];
    }
  }

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

function simplifyClosedPolygon(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 4) return points;
  const doubled = [...points, ...points];
  const simplified = douglasPeucker(doubled, epsilon);
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

  // Compute Sobel edge map
  const edgeMap = computeEdgeMap(data, w, h);

  // Compute centroid of the input polygon
  let cx = 0, cy = 0;
  for (const [px, py] of polygon) { cx += px; cy += py; }
  cx = Math.round(cx / polygon.length);
  cy = Math.round(cy / polygon.length);

  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;

  // Compute adaptive edge threshold based on the local area
  // Use the average polygon radius as the sample ring radius
  let avgR = 0;
  for (const [px, py] of polygon) avgR += Math.hypot(px - cx, py - cy);
  avgR /= polygon.length;
  const edgeThreshold = computeAdaptiveThreshold(edgeMap, w, h, cx, cy, Math.max(10, avgR * 0.5));

  // Sample interior color for color-deviation detection
  // This helps detect semi-transparent colored bubbles where Sobel edges are weak
  const [refR, refG, refB] = sampleInteriorColor(data, w, h, cx, cy);

  // Cast rays from centroid and find boundary points
  // Dual detection criteria:
  //   A) Strong Sobel edge (consecutive edge pixels) — works for sharp boundaries
  //   B) Color deviation from interior — works for gradual/semi-transparent transitions
  const boundaryPoints: [number, number][] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (2 * Math.PI * i) / RAY_COUNT;
    const dx = Math.cos(angle) * RAY_STEP;
    const dy = Math.sin(angle) * RAY_STEP;

    let x = cx;
    let y = cy;
    let edgeRunCount = 0;
    let colorRunCount = 0;
    let hitX = -1, hitY = -1;

    for (let step = 0; step < MAX_RAY_LENGTH / RAY_STEP; step++) {
      x += dx;
      y += dy;

      const ix = Math.round(x);
      const iy = Math.round(y);

      // Out of image bounds
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
        if (hitX < 0) { hitX = ix - Math.round(dx); hitY = iy - Math.round(dy); }
        break;
      }

      // Criterion A: Sobel edge
      const edgeVal = edgeMap[iy * w + ix];
      const isEdge = edgeVal >= edgeThreshold;

      // Criterion B: color deviation from interior baseline
      const deviation = colorDeviation(data, w, ix, iy, refR, refG, refB);
      const isColorDeviant = deviation >= COLOR_DEVIATION_THRESHOLD;

      // A pixel is a boundary candidate if it has a strong edge OR significant color change
      if (isEdge || isColorDeviant) {
        if (isEdge) edgeRunCount++; else edgeRunCount = 0;
        colorRunCount++;
        if (colorRunCount === 1) { hitX = ix; hitY = iy; }
        // Require shorter run for Sobel edges (strong signal), longer for color-only
        if (edgeRunCount >= BOUNDARY_RUN_LENGTH || colorRunCount >= BOUNDARY_RUN_LENGTH + 2) break;
      } else {
        edgeRunCount = 0;
        colorRunCount = 0;
        hitX = -1;
        hitY = -1;
      }
    }

    if (hitX >= 0 && hitY >= 0) {
      boundaryPoints.push([hitX, hitY]);
    }
  }

  if (boundaryPoints.length < 10) return null;

  // Build ordered contour using angular buckets (360 buckets = 1° resolution)
  const contour = buildContour(boundaryPoints, cx, cy, 360);
  if (contour.length < 4) return null;

  // Simplify — adaptive epsilon based on bubble size
  let maxR = 0;
  for (const [px, py] of contour) {
    const r = Math.hypot(px - cx, py - cy);
    if (r > maxR) maxR = r;
  }
  const epsilon = Math.max(2, maxR * 0.02);
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
