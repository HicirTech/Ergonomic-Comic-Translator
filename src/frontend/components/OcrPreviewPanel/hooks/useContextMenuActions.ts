import React, { useCallback, useState } from "react";
import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import type { ContextMenuState } from "../types.ts";
import { findNearestSegmentInsertIndex, normalizeLineIndices } from "../helpers.ts";
import { buildMergedLine } from "./useLineOperations.ts";

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

  const handleMergeSelectedLines = useCallback(() => {
    const indices = Array.from(selectedLineIndicesRef.current).sort((a, b) => a - b);
    if (indices.length < 2) return;

    const linesToMerge = indices.map((i) => linesRef.current[i]).filter(Boolean);
    if (linesToMerge.length < 2) return;

    // Build merged line
    const keepIndex = indices[0];
    const merged = buildMergedLine(linesToMerge, linesRef.current[keepIndex].lineIndex);
    if (!merged) return;

    // Remove merged lines (except the first) and replace the first with merged
    const removeSet = new Set(indices.slice(1));
    const ocrIndicesToRemove = new Set(indices.slice(1).map((i) => linesRef.current[i]?.lineIndex));
    const nextLines: OcrLineItem[] = [];
    for (let i = 0; i < linesRef.current.length; i++) {
      if (removeSet.has(i)) continue;
      if (i === keepIndex) {
        nextLines.push(merged);
      } else {
        nextLines.push(linesRef.current[i]);
      }
    }

    // Merge translations
    const mergedTranslation = indices
      .map((i) => {
        const ocrIdx = linesRef.current[i]?.lineIndex;
        return translatedLinesRef.current.find((tl) => tl.lineIndex === ocrIdx)?.translated ?? "";
      })
      .filter(Boolean)
      .join("\n");

    const nextTranslated = translatedLinesRef.current
      .filter((tl) => !ocrIndicesToRemove.has(tl.lineIndex));
    // Update or add the merged translation
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
    // Remap translation lineIndices to match normalized lines
    const oldToNew = new Map<number, number>();
    nextLines.forEach((line, i) => oldToNew.set(line.lineIndex, i));
    const remappedTranslated = nextTranslated
      .map((tl) => {
        const n = oldToNew.get(tl.lineIndex);
        return n !== undefined ? { ...tl, lineIndex: n } : null;
      })
      .filter((tl): tl is TranslatedLine => tl !== null);

    applyHistoryEdit(normalized, undefined, remappedTranslated);
    setSelectedLineIndex(0); // select the merged line (first position after normalize)
    setSelectedLineIndices(new Set());
    setContextMenu(null);
  }, [applyHistoryEdit]);

  return {
    contextMenu,
    setContextMenu,
    openPolygonMenu,
    handleAddPolygonPoint,
    handleDeletePolygonPoint,
    handleDeleteTextLine,
    handleAddNewLine,
    handleMergeSelectedLines,
  };
}
