import { useCallback } from "react";
import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import { normalizeLineIndices, convexHull } from "../helpers.ts";
import { polyBounds } from "../utils/polygonGeometry.ts";

/**
 * Exposes updateLine, deleteLines, deleteSelectedLine built on top of
 * applyHistoryEdit so every mutation is recorded in the undo stack.
 */
export function useLineOperations(
  linesRef: React.RefObject<OcrLineItem[]>,
  translatedLinesRef: React.RefObject<TranslatedLine[]>,
  applyHistoryEdit: (
    lines: OcrLineItem[],
    mode?: "text" | "textless",
    translated?: TranslatedLine[],
  ) => void,
  setSelectedLineIndex: React.Dispatch<React.SetStateAction<number | null>>,
  setSelectedLineIndices: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>,
) {
  const updateLine = useCallback(
    (index: number, updater: (line: OcrLineItem) => OcrLineItem) => {
      const prev = linesRef.current;
      if (!prev[index]) return;
      const next = [...prev];
      next[index] = updater(next[index]);
      applyHistoryEdit(next);
    },
    [applyHistoryEdit],
  );

  const deleteLines = useCallback(
    (arrayIndices: number[]) => {
      if (arrayIndices.length === 0) return;
      const arrayIndexSet = new Set(arrayIndices);
      const oldOcrToNewIdx = new Map<number, number>();
      let newPos = 0;
      for (let i = 0; i < linesRef.current.length; i++) {
        if (!arrayIndexSet.has(i))
          oldOcrToNewIdx.set(linesRef.current[i].lineIndex, newPos++);
      }
      const ocrIndicesToDelete = new Set(
        arrayIndices.map((i) => linesRef.current[i]?.lineIndex ?? i),
      );
      const nextLines = normalizeLineIndices(
        linesRef.current.filter((_, idx) => !arrayIndexSet.has(idx)),
      );
      const nextTranslated = translatedLinesRef.current
        .filter((tl) => !ocrIndicesToDelete.has(tl.lineIndex))
        .map((tl) => {
          const n = oldOcrToNewIdx.get(tl.lineIndex);
          return n !== undefined ? { ...tl, lineIndex: n } : tl;
        });
      applyHistoryEdit(nextLines, undefined, nextTranslated);
      setSelectedLineIndex(null);
      setSelectedLineIndices(new Set());
    },
    [applyHistoryEdit],
  );

  const deleteSelectedLine = useCallback(
    (lineIndex: number) => {
      const deletedOcrIdx =
        linesRef.current[lineIndex]?.lineIndex ?? lineIndex;
      const nextTranslated = translatedLinesRef.current
        .filter((tl) => tl.lineIndex !== deletedOcrIdx)
        .map((tl) =>
          tl.lineIndex > deletedOcrIdx
            ? { ...tl, lineIndex: tl.lineIndex - 1 }
            : tl,
        );
      applyHistoryEdit(
        normalizeLineIndices(
          linesRef.current.filter((_, idx) => idx !== lineIndex),
        ),
        undefined,
        nextTranslated,
      );
      setSelectedLineIndex((prev) => {
        if (prev === null) return null;
        if (prev === lineIndex) return null;
        if (prev > lineIndex) return prev - 1;
        return prev;
      });
    },
    [applyHistoryEdit],
  );

  return { updateLine, deleteLines, deleteSelectedLine };
}

/**
 * Merge multiple lines into a single line with a convex-hull polygon.
 * Text is concatenated in top-to-bottom reading order (by polygon centroid Y).
 * Returns the merged line or null if fewer than 2 lines are provided.
 */
export function buildMergedLine(lines: OcrLineItem[], startIndex: number): OcrLineItem | null {
  if (lines.length < 2) return null;

  // Sort by vertical centroid for reading order
  const sorted = lines.slice().sort((a, b) => {
    const aY = a.polygon ? polyBounds(a.polygon).cy : 0;
    const bY = b.polygon ? polyBounds(b.polygon).cy : 0;
    return aY - bY;
  });

  // Merge text (newline-separated)
  const mergedText = sorted.map((l) => l.text).join("\n");

  // Collect all polygon vertices and compute convex hull
  const allPoints: [number, number][] = [];
  for (const line of sorted) {
    if (line.polygon) {
      for (const p of line.polygon) allPoints.push([p[0], p[1]]);
    }
  }
  const hull = allPoints.length >= 3 ? convexHull(allPoints) : allPoints;

  // Compute AABB from hull
  const bounds = hull.length >= 3 ? polyBounds(hull) : null;
  const box: [number, number, number, number] | null = bounds
    ? [bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h]
    : null;

  // Use orientation from first line
  const orientation = sorted[0].orientation;

  return {
    lineIndex: startIndex,
    text: mergedText,
    box,
    polygon: hull.length >= 3 ? hull : null,
    orientation,
  };
}
