import React, { useCallback, useState } from "react";
import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import type { ContextMenuState, MergePreviewItem } from "../types.ts";
import { findNearestSegmentInsertIndex, normalizeLineIndices } from "../helpers.ts";
import { buildMergedLine } from "./useLineOperations.ts";
import { polyBounds } from "../utils/polygonGeometry.ts";
import { detectBubbleBoundary } from "../utils/detectBubble.ts";

/**
 * Manages the SVG context-menu state and the five actions available from it:
 * add polygon point, delete polygon point, delete text line, add new line.
 */
export function useContextMenuActions(
  linesRef: React.RefObject<OcrLineItem[]>,
  translatedLinesRef: React.RefObject<TranslatedLine[]>,
  linesLength: number,
  applyHistoryEdit: (
    lines: OcrLineItem[],
    mode?: "text" | "textless",
    translated?: TranslatedLine[],
  ) => void,
  updateLine: (index: number, updater: (line: OcrLineItem) => OcrLineItem) => void,
  getSvgPoint: (event: React.MouseEvent | MouseEvent) => [number, number] | null,
  setSelectedLineIndex: React.Dispatch<React.SetStateAction<number | null>>,
  setSelectedLineIndices: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>,
  selectedLineIndicesRef: React.RefObject<ReadonlySet<number>>,
  imgRef: React.RefObject<HTMLImageElement | null>,
) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openPolygonMenu = useCallback(
    (event: React.MouseEvent, lineIndex: number, pointIndex: number | null) => {
      event.preventDefault();
      event.stopPropagation();
      const point = getSvgPoint(event);
      if (!point) return;
      setSelectedLineIndex(lineIndex);
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        lineIndex,
        pointIndex,
        clickPoint: point,
        kind: "polygon",
      });
    },
    [getSvgPoint],
  );

  const handleAddPolygonPoint = useCallback(() => {
    if (!contextMenu) return;
    updateLine(contextMenu.lineIndex, (line) => {
      const polygon = line.polygon ? [...line.polygon] : [];
      const insertIndex = findNearestSegmentInsertIndex(polygon, contextMenu.clickPoint);
      polygon.splice(insertIndex, 0, contextMenu.clickPoint);
      return { ...line, polygon };
    });
    setContextMenu(null);
  }, [contextMenu, updateLine]);

  const handleDeletePolygonPoint = useCallback(() => {
    if (!contextMenu || contextMenu.pointIndex === null) return;
    updateLine(contextMenu.lineIndex, (line) => {
      if (!line.polygon || line.polygon.length <= 3) return line;
      return {
        ...line,
        polygon: line.polygon.filter((_, idx) => idx !== contextMenu.pointIndex),
      };
    });
    setContextMenu(null);
  }, [contextMenu, updateLine]);

  const handleDeleteTextLine = useCallback(() => {
    if (!contextMenu) return;
    const deletedOcrIdx =
      linesRef.current[contextMenu.lineIndex]?.lineIndex ?? contextMenu.lineIndex;
    const nextTranslated = translatedLinesRef.current
      .filter((tl) => tl.lineIndex !== deletedOcrIdx)
      .map((tl) =>
        tl.lineIndex > deletedOcrIdx
          ? { ...tl, lineIndex: tl.lineIndex - 1 }
          : tl,
      );
    applyHistoryEdit(
      normalizeLineIndices(
        linesRef.current.filter((_, idx) => idx !== contextMenu.lineIndex),
      ),
      undefined,
      nextTranslated,
    );
    setSelectedLineIndex((prev) => {
      if (prev === null) return null;
      if (prev === contextMenu.lineIndex) return null;
      if (prev > contextMenu.lineIndex) return prev - 1;
      return prev;
    });
    setContextMenu(null);
  }, [contextMenu, applyHistoryEdit]);

  const handleAddNewLine = useCallback(() => {
    if (!contextMenu) return;
    const [cx, cy] = contextMenu.clickPoint;
    const newPolygon: [number, number][] = [
      [cx - 50, cy - 50],
      [cx + 50, cy - 50],
      [cx + 50, cy + 50],
      [cx - 50, cy + 50],
    ];
    const newLine: OcrLineItem = {
      lineIndex: linesLength,
      text: "",
      box: [cx - 50, cy - 50, cx + 50, cy + 50],
      polygon: newPolygon,
      orientation: "horizontal",
    };
    const newIndex = linesLength;
    applyHistoryEdit(normalizeLineIndices([...linesRef.current, newLine]));
    setSelectedLineIndex(newIndex);
    setContextMenu(null);
  }, [contextMenu, linesLength, applyHistoryEdit]);

  // ── Merge preview dialog state ──────────────────────────────────────
  const [mergePreviewItems, setMergePreviewItems] = useState<MergePreviewItem[]>([]);
  const [mergePreviewOpen, setMergePreviewOpen] = useState(false);

  /** Open the merge-preview dialog (called from context menu). */
  const handleOpenMergePreview = useCallback(() => {
    const indices = Array.from(selectedLineIndicesRef.current).sort((a, b) => a - b);
    if (indices.length < 2) return;

    // Build preview items sorted by centroid Y (default reading order)
    const items: MergePreviewItem[] = indices
      .map((i) => {
        const line = linesRef.current[i];
        if (!line) return null;
        const ocrIdx = line.lineIndex;
        const translated =
          translatedLinesRef.current.find((tl) => tl.lineIndex === ocrIdx)?.translated ?? "";
        return { arrayIndex: i, text: line.text, translated } as MergePreviewItem;
      })
      .filter((it): it is MergePreviewItem => it !== null)
      .sort((a, b) => {
        const aLine = linesRef.current[a.arrayIndex];
        const bLine = linesRef.current[b.arrayIndex];
        const aY = aLine?.polygon ? polyBounds(aLine.polygon).cy : 0;
        const bY = bLine?.polygon ? polyBounds(bLine.polygon).cy : 0;
        return aY - bY;
      });

    if (items.length < 2) return;
    setMergePreviewItems(items);
    setMergePreviewOpen(true);
    setContextMenu(null);
  }, []);

  /** Execute merge with user-confirmed order. */
  const handleConfirmMerge = useCallback((orderedItems: MergePreviewItem[]) => {
    setMergePreviewOpen(false);

    const orderedIndices = orderedItems.map((it) => it.arrayIndex);
    const linesToMerge = orderedIndices.map((i) => linesRef.current[i]).filter(Boolean);
    if (linesToMerge.length < 2) return;

    const keepIndex = orderedIndices[0];
    const merged = buildMergedLine(linesToMerge, linesRef.current[keepIndex].lineIndex);
    if (!merged) return;

    // Remove merged lines (except the first) and replace the first with merged
    const removeSet = new Set(orderedIndices.slice(1));
    const ocrIndicesToRemove = new Set(orderedIndices.slice(1).map((i) => linesRef.current[i]?.lineIndex));
    const nextLines: OcrLineItem[] = [];
    for (let i = 0; i < linesRef.current.length; i++) {
      if (removeSet.has(i)) continue;
      if (i === keepIndex) {
        nextLines.push(merged);
      } else {
        nextLines.push(linesRef.current[i]);
      }
    }

    // Merge translations in user-specified order
    const mergedTranslation = orderedItems
      .map((it) => it.translated)
      .filter(Boolean)
      .join("\n");

    const nextTranslated = translatedLinesRef.current
      .filter((tl) => !ocrIndicesToRemove.has(tl.lineIndex));
    const keepOcrIdx = linesRef.current[keepIndex].lineIndex;
    const existingTlIdx = nextTranslated.findIndex((tl) => tl.lineIndex === keepOcrIdx);
    if (mergedTranslation) {
      if (existingTlIdx >= 0) {
        nextTranslated[existingTlIdx] = { lineIndex: keepOcrIdx, translated: mergedTranslation };
      } else {
        nextTranslated.push({ lineIndex: keepOcrIdx, translated: mergedTranslation });
      }
    }

    const normalized = normalizeLineIndices(nextLines);
    const oldToNew = new Map<number, number>();
    nextLines.forEach((line, i) => oldToNew.set(line.lineIndex, i));
    const remappedTranslated = nextTranslated
      .map((tl) => {
        const n = oldToNew.get(tl.lineIndex);
        return n !== undefined ? { ...tl, lineIndex: n } : null;
      })
      .filter((tl): tl is TranslatedLine => tl !== null);

    applyHistoryEdit(normalized, undefined, remappedTranslated);
    setSelectedLineIndex(0);
    setSelectedLineIndices(new Set());
  }, [applyHistoryEdit]);

  const handleCancelMerge = useCallback(() => {
    setMergePreviewOpen(false);
  }, []);

  // ── Snap polygon to bubble ────────────────────────────────────────
  const handleSnapToBubble = useCallback(() => {
    if (!contextMenu) return;
    const line = linesRef.current[contextMenu.lineIndex];
    if (!line?.polygon || line.polygon.length < 3) return;
    const img = imgRef.current;
    if (!img) return;

    const snapped = detectBubbleBoundary(img, line.polygon, 5);
    if (!snapped) {
      setContextMenu(null);
      return;
    }

    // Compute AABB from new polygon
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of snapped) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    updateLine(contextMenu.lineIndex, (l) => ({
      ...l,
      polygon: snapped,
      box: [minX, minY, maxX, maxY],
    }));
    setContextMenu(null);
  }, [contextMenu, updateLine]);

  return {
    contextMenu,
    setContextMenu,
    openPolygonMenu,
    handleAddPolygonPoint,
    handleDeletePolygonPoint,
    handleDeleteTextLine,
    handleAddNewLine,
    handleOpenMergePreview,
    handleConfirmMerge,
    handleCancelMerge,
    handleSnapToBubble,
    mergePreviewOpen,
    mergePreviewItems,
  };
}
