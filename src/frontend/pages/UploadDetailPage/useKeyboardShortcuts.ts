import { useEffect, useRef } from "react";
import type { OcrPreviewPanelRef } from "../../components/OcrPreviewPanel/types.ts";

interface UseKeyboardShortcutsOptions {
  panelRef: React.RefObject<OcrPreviewPanelRef | null>;
  selectedPage: number;
  pageCountRef: React.RefObject<number>;
  handleSelectPage: (page: number) => void;
  undoPageSwitch: () => boolean;
  redoPageSwitch: () => boolean;
}

export const useKeyboardShortcuts = ({
  panelRef,
  selectedPage,
  pageCountRef,
  handleSelectPage,
  undoPageSwitch,
  redoPageSwitch,
}: UseKeyboardShortcutsOptions) => {
  const undoRef = useRef(undoPageSwitch);
  const redoRef = useRef(redoPageSwitch);
  const selectPageRef = useRef(handleSelectPage);
  const selectedPageRef = useRef(selectedPage);

  undoRef.current = undoPageSwitch;
  redoRef.current = redoPageSwitch;
  selectPageRef.current = handleSelectPage;
  selectedPageRef.current = selectedPage;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) return;
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedo = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z";
      const isSave = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "s";
      const isPageUp = event.key === "PageUp";
      const isPageDown = event.key === "PageDown";
      if (!isUndo && !isRedo && !isSave && !isPageUp && !isPageDown) return;

      const active = document.activeElement;
      const inInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement | null)?.isContentEditable === true;

      if ((isUndo || isRedo) && inInput) return;

      event.preventDefault();
      if (isSave) {
        void panelRef.current?.saveIfDirty();
        return;
      }
      if (isUndo) {
        const consumed = panelRef.current?.undo() ?? false;
        if (!consumed) undoRef.current();
      }
      if (isRedo) {
        const consumed = panelRef.current?.redo() ?? false;
        if (!consumed) redoRef.current();
      }
      if (isPageUp) {
        const next = selectedPageRef.current - 1;
        if (next >= 0) {
          void panelRef.current?.saveIfDirty();
          selectPageRef.current(next);
        }
      }
      if (isPageDown) {
        const next = selectedPageRef.current + 1;
        if (next < pageCountRef.current) {
          void panelRef.current?.saveIfDirty();
          selectPageRef.current(next);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelRef, pageCountRef]);
};
