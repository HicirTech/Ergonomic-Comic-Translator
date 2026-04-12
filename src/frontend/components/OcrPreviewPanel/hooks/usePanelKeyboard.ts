import React, { useCallback } from "react";
import type { OcrLineItem } from "../../../api/index.ts";

/**
 * Centralized keyboard handler for the OCR preview panel.
 * Reading selection from refs keeps the callback stable across selection changes,
 * preventing identity-driven re-renders of the context value.
 */
export function usePanelKeyboard(
  linesRef: React.RefObject<OcrLineItem[]>,
  selectedLineIndexRef: React.RefObject<number | null>,
  selectedLineIndicesRef: React.RefObject<ReadonlySet<number>>,
  setSelectedLineIndex: React.Dispatch<React.SetStateAction<number | null>>,
  setSelectedLineIndices: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>,
  handleSave: () => Promise<void>,
  deleteSelectedLine: (lineIndex: number) => void,
  deleteLines: (arrayIndices: number[]) => void,
) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey) return;
      const isSave =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "s";
      const isSelectAll =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "a";
      const isDelete = event.key === "Delete" || event.key === "Backspace";
      const isEscape = event.key === "Escape";
      if (!isSave && !isSelectAll && !isDelete && !isEscape) return;

      const active = document.activeElement;
      const inInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement | null)?.isContentEditable === true;

      if (isEscape) {
        const selIdx = selectedLineIndexRef.current;
        const selIndices = selectedLineIndicesRef.current;
        if (selIdx !== null || selIndices.size > 0) {
          event.preventDefault();
          setSelectedLineIndex(null);
          if (selIndices.size > 0) setSelectedLineIndices(new Set());
        }
        return;
      }

      if (isSelectAll) {
        if (inInput) return;
        const count = linesRef.current.length;
        if (count === 0) return;
        event.preventDefault();
        setSelectedLineIndices(
          new Set(Array.from({ length: count }, (_, i) => i)),
        );
        setSelectedLineIndex(0);
        return;
      }

      if (isDelete) {
        if (inInput) return;
        event.preventDefault();
        const selIndices = selectedLineIndicesRef.current;
        const selIdx = selectedLineIndexRef.current;
        if (selIndices.size > 1) {
          deleteLines([...selIndices]);
        } else {
          if (selIdx !== null) deleteSelectedLine(selIdx);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void handleSave();
    },
    [handleSave, deleteSelectedLine, deleteLines],
  );
}
