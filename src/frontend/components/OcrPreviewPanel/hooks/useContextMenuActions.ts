import React, { useCallback, useState } from "react";
import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import type { ContextMenuState } from "../types.ts";
import { findNearestSegmentInsertIndex, normalizeLineIndices } from "../helpers.ts";

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

  return {
    contextMenu,
    setContextMenu,
    openPolygonMenu,
    handleAddPolygonPoint,
    handleDeletePolygonPoint,
    handleDeleteTextLine,
    handleAddNewLine,
  };
}
