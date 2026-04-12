import type { OcrLineItem, TranslatedLine } from "../../api/index.ts";
import type { PageHistoryState } from "./types.ts";

// ── Module-scoped history store ──────────────────────────────────────────────

export const uploadHistoryStore = new Map<string, Map<number, PageHistoryState>>();

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const normalizeLineIndices = (lines: OcrLineItem[]): OcrLineItem[] =>
  lines.map((line, idx) => ({ ...line, lineIndex: idx }));

export const cloneLines = (lines: OcrLineItem[]): OcrLineItem[] =>
  lines.map((line) => ({
    ...line,
    box: line.box ? [...line.box] as [number, number, number, number] : null,
    polygon: line.polygon ? line.polygon.map((p) => [p[0], p[1]] as [number, number]) : null,
  }));

export const sameLines = (a: OcrLineItem[], b: OcrLineItem[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]; const bi = b[i];
    if (ai.lineIndex !== bi.lineIndex || ai.text !== bi.text || ai.orientation !== bi.orientation) return false;
    // box
    if (ai.box === null !== (bi.box === null)) return false;
    if (ai.box && bi.box && (ai.box[0] !== bi.box[0] || ai.box[1] !== bi.box[1] || ai.box[2] !== bi.box[2] || ai.box[3] !== bi.box[3])) return false;
    // polygon
    if (ai.polygon === null !== (bi.polygon === null)) return false;
    if (ai.polygon && bi.polygon) {
      if (ai.polygon.length !== bi.polygon.length) return false;
      for (let j = 0; j < ai.polygon.length; j++) {
        if (ai.polygon[j][0] !== bi.polygon[j][0] || ai.polygon[j][1] !== bi.polygon[j][1]) return false;
      }
    }
  }
  return true;
};

export const cloneTranslatedLines = (lines: TranslatedLine[]): TranslatedLine[] =>
  lines.map((l) => ({ lineIndex: l.lineIndex, translated: l.translated }));

export const sameTranslatedLines = (a: TranslatedLine[], b: TranslatedLine[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].lineIndex !== b[i].lineIndex || a[i].translated !== b[i].translated) return false;
  }
  return true;
};

export const getPageHistoryState = (uploadId: string, pageIndex: number): PageHistoryState => {
  let uploadMap = uploadHistoryStore.get(uploadId);
  if (!uploadMap) {
    uploadMap = new Map<number, PageHistoryState>();
    uploadHistoryStore.set(uploadId, uploadMap);
  }
  let state = uploadMap.get(pageIndex);
  if (!state) {
    state = { undo: [], redo: [] };
    uploadMap.set(pageIndex, state);
  }
  return state;
};

export const findNearestSegmentInsertIndex = (polygon: [number, number][], point: [number, number]): number => {
  if (polygon.length < 2) return polygon.length;
  let bestIndex = polygon.length;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const apx = point[0] - a[0];
    const apy = point[1] - a[1];
    const denom = abx * abx + aby * aby;
    const t = denom > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom)) : 0;
    const cx = a[0] + abx * t;
    const cy = a[1] + aby * t;
    const dx = point[0] - cx;
    const dy = point[1] - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
};

// ── Convex hull (Andrew's monotone chain) ────────────────────────────────────

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Compute the convex hull of a set of 2D points using Andrew's monotone chain.
 * Returns vertices in counter-clockwise order.
 */
export function convexHull(points: [number, number][]): [number, number][] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;

  // Lower hull
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  // Upper hull
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
