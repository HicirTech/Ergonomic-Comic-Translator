/**
 * Detect the speech-bubble boundary around a polygon and return a new polygon
 * snapped to the inner edge of the bubble with a configurable inset.
 *
 * Uses the textless page image (text already removed) so that inpainted text
 * doesn't interfere with boundary detection.
 *
 * Algorithm — gradient-based ray-casting with polygon-aware minimum distance:
 * 1. Load the image and compute a Sobel edge-magnitude map (with Gaussian pre-blur).
 * 2. Compute the minimum per-ray distance from the polygon boundary.
 *    Since text is inside the bubble, no bubble edge can be closer than the polygon edge.
 * 3. Cast 360 rays from the polygon centroid outward.
 *    Skip any edge hit closer than the polygon boundary for that direction.
 * 4. Apply median smoothing on hit distances to reject remaining outliers.
 * 5. Build an ordered contour from the smoothed hit points.
 * 6. Simplify the contour with Douglas-Peucker.
 * 7. Inset each vertex by `insetPx` toward the centroid.
 *
 * Works with both light and dark bubble backgrounds because it relies on
 * brightness *changes* (edges) rather than absolute brightness values.
 */

const RAY_COUNT = 360;
const RAY_STEP = 1;
const MAX_RAY_LENGTH = 800;
// Sobel edge threshold. After 5×5 Gaussian blur, bubble outlines (even thin
// semi-transparent ones) produce Sobel ≈ 25–37. Threshold 20 catches them
// while staying above blur-suppressed noise.
const SOBEL_THRESHOLD = 20;
// How many consecutive edge pixels to declare a boundary.
// Pre-blur widens thin 1-2px outlines to ~3-4px.
const EDGE_RUN_LENGTH = 3;
// Angular half-window (in buckets) for median smoothing of hit distances.
// ±20 = 40° window.
const MEDIAN_HALF_WINDOW = 20;
// Outlier rejection: ray distance < median × this fraction is replaced.
const OUTLIER_RATIO = 0.55;

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
 * Apply a 5×5 separable Gaussian blur (σ ≈ 1.0) to a luminance array.
 * Kernel: [1 4 6 4 1] / 16 per pass (total /256).
 * Widens thin 1-2px outlines to ~4px for reliable Sobel detection.
 */
function gaussianBlur5(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 2);
      const x1 = Math.max(0, x - 1);
      const x3 = Math.min(w - 1, x + 1);
      const x4 = Math.min(w - 1, x + 2);
      tmp[y * w + x] =
        src[y * w + x0] +
        src[y * w + x1] * 4 +
        src[y * w + x] * 6 +
        src[y * w + x3] * 4 +
        src[y * w + x4];
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 2);
    const y1 = Math.max(0, y - 1);
    const y3 = Math.min(h - 1, y + 1);
    const y4 = Math.min(h - 1, y + 2);
    for (let x = 0; x < w; x++) {
      dst[y * w + x] = (
        tmp[y0 * w + x] +
        tmp[y1 * w + x] * 4 +
        tmp[y * w + x] * 6 +
        tmp[y3 * w + x] * 4 +
        tmp[y4 * w + x]
      ) / 256;
    }
  }
  return dst;
}

/**
 * Compute Sobel edge magnitude for every pixel (with Gaussian pre-blur).
 */
function computeEdgeMap(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lumRaw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    lumRaw[i] = data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
  }
  const lum = gaussianBlur5(lumRaw, w, h);
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
 * Compute minimum ray distance per angular bucket from the polygon boundary.
 * For each ray, compute where it exits the polygon (ray–segment intersection).
 * Since the text polygon is inside the bubble, no bubble edge can be closer
 * to the centroid than the polygon boundary in that direction.
 */
function computeMinDistances(
  polygon: [number, number][],
  cx: number, cy: number,
  bucketCount: number,
): Float32Array {
  const minDist = new Float32Array(bucketCount);
  const n = polygon.length;

  for (let i = 0; i < bucketCount; i++) {
    const angle = (2 * Math.PI * i) / bucketCount;
    const rdx = Math.cos(angle);
    const rdy = Math.sin(angle);

    let bestDist = 0;
    // Test ray against every polygon edge
    for (let j = 0; j < n; j++) {
      const [ax, ay] = polygon[j];
      const [bx, by] = polygon[(j + 1) % n];
      const ex = bx - ax;
      const ey = by - ay;
      // Solve: (cx + rdx*t) = (ax + ex*u), (cy + rdy*t) = (ay + ey*u)
      const denom = rdx * ey - rdy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((ax - cx) * ey - (ay - cy) * ex) / denom;
      const u = ((ax - cx) * rdy - (ay - cy) * rdx) / denom;
      if (t > 0 && u >= 0 && u <= 1) {
        if (t > bestDist) bestDist = t;
      }
    }
    minDist[i] = bestDist;
  }

  return minDist;
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

  // Compute Sobel edge map (with Gaussian pre-blur)
  const edgeMap = computeEdgeMap(data, w, h);

  // Compute centroid of the input polygon
  let cx = 0, cy = 0;
  for (const [px, py] of polygon) { cx += px; cy += py; }
  cx = Math.round(cx / polygon.length);
  cy = Math.round(cy / polygon.length);

  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;

  // Compute minimum distance per ray direction from the polygon boundary.
  // Since the text polygon is inside the bubble, no bubble edge can be
  // closer to the centroid than the polygon edge in that direction.
  const minDistances = computeMinDistances(polygon, cx, cy, RAY_COUNT);

  // ── Phase 1: Cast rays and collect raw hit distances ──────────────
  const hitDistances = new Float32Array(RAY_COUNT); // 0 = no hit
  const hitPoints: ([number, number] | null)[] = new Array(RAY_COUNT).fill(null);

  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (2 * Math.PI * i) / RAY_COUNT;
    const dx = Math.cos(angle) * RAY_STEP;
    const dy = Math.sin(angle) * RAY_STEP;
    const minDist = minDistances[i];

    let x = cx;
    let y = cy;
    let edgeRunCount = 0;
    let hitX = -1, hitY = -1;

    for (let step = 0; step < MAX_RAY_LENGTH / RAY_STEP; step++) {
      x += dx;
      y += dy;
      const ix = Math.round(x);
      const iy = Math.round(y);

      if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
        if (hitX < 0) { hitX = ix - Math.round(dx); hitY = iy - Math.round(dy); }
        break;
      }

      const dist = Math.hypot(ix - cx, iy - cy);

      // Skip edge hits that are closer than the polygon boundary
      if (dist < minDist) continue;

      const edgeVal = edgeMap[iy * w + ix];
      if (edgeVal >= SOBEL_THRESHOLD) {
        edgeRunCount++;
        if (edgeRunCount === 1) { hitX = ix; hitY = iy; }
        if (edgeRunCount >= EDGE_RUN_LENGTH) break;
      } else {
        edgeRunCount = 0;
        hitX = -1;
        hitY = -1;
      }
    }

    if (hitX >= 0 && hitY >= 0) {
      hitDistances[i] = Math.hypot(hitX - cx, hitY - cy);
      hitPoints[i] = [hitX, hitY];
    }
  }

  // ── Phase 2: Median smoothing to reject remaining outliers ────────
  // An outlier is a ray whose hit distance is much shorter than its
  // angular neighbors (caused by interior textures or overlapping bubbles).
  const smoothedDistances = new Float32Array(RAY_COUNT);
  for (let i = 0; i < RAY_COUNT; i++) {
    const neighbors: number[] = [];
    for (let d = -MEDIAN_HALF_WINDOW; d <= MEDIAN_HALF_WINDOW; d++) {
      const j = ((i + d) % RAY_COUNT + RAY_COUNT) % RAY_COUNT;
      if (hitDistances[j] > 0) neighbors.push(hitDistances[j]);
    }
    if (neighbors.length === 0) {
      smoothedDistances[i] = 0;
      continue;
    }
    neighbors.sort((a, b) => a - b);
    smoothedDistances[i] = neighbors[Math.floor(neighbors.length / 2)];
  }

  // Replace outlier hits: if a ray's distance < median × OUTLIER_RATIO,
  // use the median distance instead (place the point on the ray at that distance)
  const boundaryPoints: [number, number][] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (2 * Math.PI * i) / RAY_COUNT;
    const median = smoothedDistances[i];
    if (median === 0) continue;

    const rawDist = hitDistances[i];
    if (rawDist > 0 && rawDist >= median * OUTLIER_RATIO) {
      // Keep original hit
      boundaryPoints.push(hitPoints[i]!);
    } else {
      // Replace with median-distance point on this ray
      const px = cx + Math.cos(angle) * median;
      const py = cy + Math.sin(angle) * median;
      boundaryPoints.push([Math.round(px), Math.round(py)]);
    }
  }

  if (boundaryPoints.length < 10) return null;

  // ── Phase 3: Build contour, simplify, inset ──────────────────────
  // Build ordered contour using angular buckets (360 buckets = 1° resolution)
  const buckets: ([number, number] | null)[] = new Array(360).fill(null);
  for (const [bx, by] of boundaryPoints) {
    const angle = Math.atan2(by - cy, bx - cx);
    const bucket = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 360) % 360;
    if (!buckets[bucket]) {
      buckets[bucket] = [bx, by];
    }
  }
  const contour: [number, number][] = [];
  for (const pt of buckets) {
    if (pt) contour.push(pt);
  }
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
