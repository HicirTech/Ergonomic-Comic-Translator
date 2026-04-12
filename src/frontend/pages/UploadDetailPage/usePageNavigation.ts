import { useCallback, useEffect, useRef, useState, startTransition } from "react";

const MAX_PAGE_HISTORY_STEPS = 5;

export const usePageNavigation = (uploadId: string | undefined) => {
  const [selectedPage, setSelectedPage] = useState(0);
  const pageUndoRef = useRef<number[]>([]);
  const pageRedoRef = useRef<number[]>([]);
  const suppressPageHistoryRef = useRef(false);
  const pageCountRef = useRef(0);

  useEffect(() => {
    pageUndoRef.current = [];
    pageRedoRef.current = [];
    setSelectedPage(0);
    suppressPageHistoryRef.current = false;
  }, [uploadId]);

  const handleSelectPage = useCallback((nextPage: number) => {
    startTransition(() => {
      setSelectedPage((current) => {
        if (current === nextPage) return current;
        if (!suppressPageHistoryRef.current) {
          pageUndoRef.current.push(current);
          if (pageUndoRef.current.length > MAX_PAGE_HISTORY_STEPS) pageUndoRef.current.shift();
          pageRedoRef.current = [];
        }
        return nextPage;
      });
    });
  }, []);

  const undoPageSwitch = useCallback(() => {
    const prev = pageUndoRef.current.pop();
    if (prev === undefined) return false;
    suppressPageHistoryRef.current = true;
    startTransition(() => {
      setSelectedPage((current) => {
        pageRedoRef.current.push(current);
        if (pageRedoRef.current.length > MAX_PAGE_HISTORY_STEPS) pageRedoRef.current.shift();
        return prev;
      });
    });
    suppressPageHistoryRef.current = false;
    return true;
  }, []);

  const redoPageSwitch = useCallback(() => {
    const next = pageRedoRef.current.pop();
    if (next === undefined) return false;
    suppressPageHistoryRef.current = true;
    startTransition(() => {
      setSelectedPage((current) => {
        pageUndoRef.current.push(current);
        if (pageUndoRef.current.length > MAX_PAGE_HISTORY_STEPS) pageUndoRef.current.shift();
        return next;
      });
    });
    suppressPageHistoryRef.current = false;
    return true;
  }, []);

  const setPageCount = useCallback((count: number) => {
    pageCountRef.current = count;
  }, []);

  return {
    selectedPage,
    handleSelectPage,
    undoPageSwitch,
    redoPageSwitch,
    pageCountRef,
    setPageCount,
  };
};
