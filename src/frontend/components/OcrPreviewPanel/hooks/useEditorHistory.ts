import { useCallback, useRef } from "react";
import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import type { EditorSnapshot } from "../types.ts";
import { cloneLines, cloneTranslatedLines, getPageHistoryState, sameLines, sameTranslatedLines } from "../helpers.ts";

const MAX_HISTORY_STEPS = 5;

export const useEditorHistory = (
  uploadId: string,
  pageIndex: number,
  linesRef: React.MutableRefObject<OcrLineItem[]>,
  imageModeRef: React.MutableRefObject<"text" | "textless">,
  translatedLinesRef: React.MutableRefObject<TranslatedLine[]>,
  setLines: (lines: OcrLineItem[] | ((prev: OcrLineItem[]) => OcrLineItem[])) => void,
  setImageMode: (mode: "text" | "textless") => void,
  setTranslatedLines: (lines: TranslatedLine[]) => void,
) => {
  const dragStartSnapshotRef = useRef<EditorSnapshot | null>(null);

  const snapshotCurrent = useCallback((): EditorSnapshot => ({
    lines: cloneLines(linesRef.current),
    imageMode: imageModeRef.current,
    translatedLines: cloneTranslatedLines(translatedLinesRef.current),
  }), [linesRef, imageModeRef, translatedLinesRef]);

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    setLines(cloneLines(snapshot.lines));
    setImageMode(snapshot.imageMode);
    setTranslatedLines(cloneTranslatedLines(snapshot.translatedLines));
  }, [setLines, setImageMode, setTranslatedLines]);

  const applyHistoryEdit = useCallback((
    nextLines: OcrLineItem[],
    nextMode?: "text" | "textless",
    nextTranslatedLines?: TranslatedLine[],
  ) => {
    const targetMode = nextMode ?? imageModeRef.current;
    const targetTranslated = nextTranslatedLines ?? translatedLinesRef.current;
    if (
      sameLines(linesRef.current, nextLines)
      && targetMode === imageModeRef.current
      && sameTranslatedLines(translatedLinesRef.current, targetTranslated)
    ) return;

    const history = getPageHistoryState(uploadId, pageIndex);
    history.undo.push(snapshotCurrent());
    if (history.undo.length > MAX_HISTORY_STEPS) history.undo.shift();
    history.redo = [];

    setLines(nextLines);
    setImageMode(targetMode);
    setTranslatedLines(targetTranslated);
  }, [uploadId, pageIndex, snapshotCurrent, linesRef, imageModeRef, translatedLinesRef, setLines, setImageMode, setTranslatedLines]);

  const commitDragHistory = useCallback(() => {
    if (!dragStartSnapshotRef.current) return;
    const before = dragStartSnapshotRef.current;
    const after = snapshotCurrent();
    dragStartSnapshotRef.current = null;
    if (
      sameLines(before.lines, after.lines)
      && before.imageMode === after.imageMode
      && sameTranslatedLines(before.translatedLines, after.translatedLines)
    ) return;
    const history = getPageHistoryState(uploadId, pageIndex);
    history.undo.push(before);
    if (history.undo.length > MAX_HISTORY_STEPS) history.undo.shift();
    history.redo = [];
  }, [uploadId, pageIndex, snapshotCurrent]);

  const undo = useCallback(() => {
    const history = getPageHistoryState(uploadId, pageIndex);
    const prev = history.undo.pop();
    if (!prev) return false;
    history.redo.push(snapshotCurrent());
    if (history.redo.length > MAX_HISTORY_STEPS) history.redo.shift();
    applySnapshot(prev);
    return true;
  }, [uploadId, pageIndex, snapshotCurrent, applySnapshot]);

  const redo = useCallback(() => {
    const history = getPageHistoryState(uploadId, pageIndex);
    const next = history.redo.pop();
    if (!next) return false;
    history.undo.push(snapshotCurrent());
    if (history.undo.length > MAX_HISTORY_STEPS) history.undo.shift();
    applySnapshot(next);
    return true;
  }, [uploadId, pageIndex, snapshotCurrent, applySnapshot]);

  return {
    dragStartSnapshotRef,
    snapshotCurrent,
    applyHistoryEdit,
    commitDragHistory,
    undo,
    redo,
  };
};
