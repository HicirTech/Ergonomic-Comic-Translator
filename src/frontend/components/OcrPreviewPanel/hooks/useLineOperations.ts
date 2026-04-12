import { useCallback } from "react";
import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import { normalizeLineIndices } from "../helpers.ts";

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
