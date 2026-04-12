/**
 * Detect the speech-bubble boundary around a polygon and return a new polygon
 * snapped to the inner edge of the bubble with a configurable inset.
 *
 * Uses the textless page image (text already removed) so that inpainted text
 * doesn't interfere with boundary detection.
 *
 * Algorithm — flood-fill on edge-thresholded image:
 * 1. Load the image and compute a Sobel edge-magnitude map (with Gaussian pre-blur).
 * 2. Binarize: pixels with edge > threshold become "walls".
 * 3. Dilate walls to close tiny gaps in thin outlines.
 * 4. Flood-fill from the polygon centroid — fills the bubble interior.
 * 5. Morphological closing (dilate+erode) on the filled mask to bridge
 *    ghost wall gaps from other bubbles visible through semi-transparent fill.
 * 6. Extract boundary pixels, group by angular bucket, take 75th percentile.
 * 7. Simplify with Douglas-Peucker, inset.
 *
 * Unlike ray-casting on the raw edge map, flood-fill correctly handles:
 * - Concave regions (speech tails)
 * - Ghost edges from other bubbles visible through semi-transparent fill
 *   (they form isolated wall fragments, not closed contours)
 */

const RAY_COUNT = 360;
// Sobel threshold for binarization. Bubble outlines produce Sobel ≈ 25–37
// after Gaussian blur. Threshold 15 catches even weak outline spots while
// letting the flood fill work around interior noise fragments.
const SOBEL_THRESHOLD = 15;
// Dilation radius (iterations). Closes 1–2px gaps in thin outlines.
const DILATE_RADIUS = 2;
// If flood fill covers more than this fraction of the image, the outline
// has a gap and the fill leaked outside the bubble.
const MAX_FILL_RATIO = 0.3;
// Morphological closing radius to bridge ghost wall gaps inside filled mask.
const CLOSE_RADIUS = 8;

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
 * Dilate a binary wall mask: any 0-pixel adjacent (4-connected) to a 1-pixel
 * becomes 1. Repeated `radius` times to close small gaps in outlines.
 */
function dilateWalls(walls: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  let current = walls;
  for (let r = 0; r < radius; r++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (current[idx]) { next[idx] = 1; continue; }
        if (
          (x > 0 && current[idx - 1]) ||
          (x < w - 1 && current[idx + 1]) ||
          (y > 0 && current[idx - w]) ||
          (y < h - 1 && current[idx + w])
        ) {
          next[idx] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

/**
 * Erode a binary mask: any 1-pixel with a 0-neighbor (4-connected) becomes 0.
 * Repeated `radius` times.
 */
function erodeMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  let current = mask;
  for (let r = 0; r < radius; r++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!current[idx]) continue;
        if (
          (x === 0 || !current[idx - 1]) ||
          (x === w - 1 || !current[idx + 1]) ||
          (y === 0 || !current[idx - w]) ||
          (y === h - 1 || !current[idx + w])
        ) continue;
        next[idx] = 1;
      }
    }
    current = next;
  }
  return current;
}

/**
 * BFS flood fill from (sx, sy) on a binary wall mask.
 * Returns a filled mask (1 = reachable from start, 0 = wall or unreachable).
 * Also returns the fill count for leak detection.
 */
function floodFill(
  walls: Uint8Array, w: number, h: number, sx: number, sy: number,
): { filled: Uint8Array; count: number } {
  const filled = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { filled, count: 0 };
  if (walls[sy * w + sx]) {
    // Start pixel is inside a wall — find nearest non-wall pixel
    for (let r = 1; r < 30; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = sy + dy, nx = sx + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w && !walls[ny * w + nx]) {
            sx = nx; sy = ny;
            // Break out of all 3 loops
            r = 30; dy = r + 1; break;
          }
        }
      }
    }
    if (walls[sy * w + sx]) return { filled, count: 0 };
  }

  const queue = new Int32Array(w * h * 2); // x, y pairs
  let head = 0, tail = 0;
  queue[tail++] = sx; queue[tail++] = sy;
  filled[sy * w + sx] = 1;
  let count = 1;

  while (head < tail) {
    const x = queue[head++];
    const y = queue[head++];
    // 4-connected neighbors
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
      const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (filled[nIdx] || walls[nIdx]) continue;
      filled[nIdx] = 1;
      count++;
      queue[tail++] = nx; queue[tail++] = ny;
    }
  }

  return { filled, count };
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
 * Given an image URL and a polygon, detect the surrounding speech bubble
 * and return a new polygon snapped to the bubble interior with `insetPx` padding.
 *
 * Returns `null` if detection fails (no bubble found or fill leaked).
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

  // Binarize: edge > threshold → wall
  const walls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (edgeMap[i] >= SOBEL_THRESHOLD) walls[i] = 1;
  }

  // Dilate walls to close tiny gaps in thin outlines
  const dilated = dilateWalls(walls, w, h, DILATE_RADIUS);

  // Add walls at image border to prevent flood fill from flowing along edges
  for (let x = 0; x < w; x++) {
    dilated[x] = 1;                   // top row
    dilated[(h - 1) * w + x] = 1;     // bottom row
  }
  for (let y = 0; y < h; y++) {
    dilated[y * w] = 1;               // left column
    dilated[y * w + (w - 1)] = 1;     // right column
  }

  // Compute centroid of the input polygon
  let cx = 0, cy = 0;
  for (const [px, py] of polygon) { cx += px; cy += py; }
  cx = Math.round(cx / polygon.length);
  cy = Math.round(cy / polygon.length);

  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;

  // Flood fill from centroid — fills the bubble interior
  const { filled, count } = floodFill(dilated, w, h, cx, cy);

  // Leak detection: if fill covers too much of the image, the outline has
  // a gap and the fill escaped the bubble
  if (count === 0 || count / (w * h) > MAX_FILL_RATIO) return null;

  // ── Morphological closing to remove internal ghost walls ──────────
  // Ghost edges from other bubbles visible through semi-transparent fill
  // create narrow wall fragments inside the filled region. Closing
  // (dilate then erode) bridges across these gaps.
  const closedMask = erodeMask(
    dilateWalls(filled, w, h, CLOSE_RADIUS),
    w, h, CLOSE_RADIUS,
  );

  // ── Extract boundary from closed mask ─────────────────────────────
  // Group boundary pixels by angular bucket and take 75th percentile
  // distance for robustness against residual noise.
  const buckets: number[][] = Array.from({ length: RAY_COUNT }, () => []);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!closedMask[idx]) continue;
      // Check if this is a boundary pixel (has at least one non-filled neighbor)
      if (closedMask[idx - 1] && closedMask[idx + 1] && closedMask[idx - w] && closedMask[idx + w]) continue;

      const angleDeg = ((Math.atan2(y - cy, x - cx) * 180 / Math.PI) % 360 + 360) % 360;
      const bucket = Math.floor(angleDeg) % RAY_COUNT;
      const dist = Math.hypot(x - cx, y - cy);
      buckets[bucket].push(dist);
    }
  }

  // Take 75th percentile distance per bucket
  const bucketDist = new Float32Array(RAY_COUNT);
  for (let i = 0; i < RAY_COUNT; i++) {
    if (buckets[i].length === 0) continue;
    buckets[i].sort((a, b) => a - b);
    const idx75 = Math.min(buckets[i].length - 1, Math.floor(buckets[i].length * 0.75));
    bucketDist[i] = buckets[i][idx75];
  }

  // Interpolate empty buckets from nearest non-empty neighbors
  for (let i = 0; i < RAY_COUNT; i++) {
    if (bucketDist[i] > 0) continue;
    let leftDist = 0, rightDist = 0;
    for (let j = 1; j < RAY_COUNT; j++) {
      const li = ((i - j) % RAY_COUNT + RAY_COUNT) % RAY_COUNT;
      if (bucketDist[li] > 0) { leftDist = bucketDist[li]; break; }
    }
    for (let j = 1; j < RAY_COUNT; j++) {
      const ri = (i + j) % RAY_COUNT;
      if (bucketDist[ri] > 0) { rightDist = bucketDist[ri]; break; }
    }
    if (leftDist > 0 && rightDist > 0) {
      bucketDist[i] = (leftDist + rightDist) / 2;
    }
  }

  // Build contour from bucket distances
  const contour: [number, number][] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    if (bucketDist[i] === 0) continue;
    const angleRad = (i * 2 * Math.PI) / RAY_COUNT;
    const px = cx + Math.cos(angleRad) * bucketDist[i];
    const py = cy + Math.sin(angleRad) * bucketDist[i];
    contour.push([Math.round(px), Math.round(py)]);
  }

  if (contour.length < 10) return null;

  // ── Simplify and inset ────────────────────────────────────────────
  // Adaptive epsilon based on bubble size
  let maxR = 0;
  for (const [px, py] of contour) {
    const r = Math.hypot(px - cx, py - cy);
    if (r > maxR) maxR = r;
  }
  const epsilon = Math.max(3, maxR * 0.03);

  // Closed polygon simplification: find the point farthest from centroid,
  // rotate the array to start there, close, simplify, un-close.
  let farthestIdx = 0;
  let farthestDist = 0;
  for (let i = 0; i < contour.length; i++) {
    const d = Math.hypot(contour[i][0] - cx, contour[i][1] - cy);
    if (d > farthestDist) { farthestDist = d; farthestIdx = i; }
  }
  const rotated = [...contour.slice(farthestIdx), ...contour.slice(0, farthestIdx)];
  // Close the polygon by repeating the first point
  rotated.push(rotated[0]);
  const simplified = douglasPeucker(rotated, epsilon);
  // Remove the closing duplicate
  simplified.pop();
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
