import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllOcrPageLines, fetchUploadPages } from "../../api/index.ts";
import ImageStripPanelView from "./ImageStripPanelView.tsx";
import { summarizeOcrLines, type OcrLineSummary } from "../../utils/ocr-line-summary.ts";

const DEFAULT_WIDTH = 250;
const COLLAPSE_THRESHOLD = 20;

export interface ImageStripPanelProps {
  uploadId: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOcrPage?: (index: number) => void;
  onTextlessPage?: (index: number) => void;
  onPagesLoaded?: (count: number) => void;
  lineSummaryOverrides?: Record<number, OcrLineSummary[]>;
  summaryReloadToken?: number;
  onAllSummariesChange?: (summaries: Record<number, OcrLineSummary[]>) => void;
}

const ImageStripPanelContainer: React.FC<ImageStripPanelProps> = ({
  uploadId,
  selectedIndex,
  onSelect,
  onOcrPage,
  onTextlessPage,
  onPagesLoaded,
  lineSummaryOverrides,
  summaryReloadToken,
  onAllSummariesChange,
}) => {
  const [pages, setPages] = useState<string[]>([]);
  const [pageLineSummaries, setPageLineSummaries] = useState<Record<number, OcrLineSummary[]>>({});
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const isResizingRef = useRef(false);

  useEffect(() => {
    fetchUploadPages(uploadId)
      .then((p) => { setPages(p); onPagesLoaded?.(p.length); })
      .catch(console.error);
  }, [uploadId]);

  useEffect(() => {
    fetchAllOcrPageLines(uploadId)
      .then((pagesData) => {
        const next: Record<number, OcrLineSummary[]> = {};
        pagesData.forEach((page) => {
          next[page.pageNumber - 1] = summarizeOcrLines(page.lines);
        });
        setPageLineSummaries(next);
      })
      .catch(console.error);
  }, [uploadId, summaryReloadToken]);

  const mergedPageLineSummaries = useMemo(() => {
    if (!lineSummaryOverrides || Object.keys(lineSummaryOverrides).length === 0) return pageLineSummaries;
    return { ...pageLineSummaries, ...lineSummaryOverrides };
  }, [pageLineSummaries, lineSummaryOverrides]);

  useEffect(() => {
    onAllSummariesChange?.(mergedPageLineSummaries);
  }, [mergedPageLineSummaries, onAllSummariesChange]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;

    // Prevent text selection while resizing
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = ev.clientX;
      if (newWidth < COLLAPSE_THRESHOLD) {
        isResizingRef.current = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        setCollapsed(true);
      } else {
        setPanelWidth(Math.max(120, newWidth));
      }
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleExpand = useCallback(() => {
    setCollapsed(false);
    setPanelWidth(DEFAULT_WIDTH);
  }, []);

  return (
    <ImageStripPanelView
      uploadId={uploadId}
      pages={pages}
      panelWidth={panelWidth}
      collapsed={collapsed}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      onResizeMouseDown={handleResizeMouseDown}
      onExpand={handleExpand}
      onOcrPage={onOcrPage}
      onTextlessPage={onTextlessPage}
      pageLineSummaries={mergedPageLineSummaries}
    />
  );
};

export default ImageStripPanelContainer;
