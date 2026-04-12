import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchOcrPageLines, fetchTranslationPage, getTextlessPageUrl, getUploadPageUrl, saveOcrPageLines, saveTranslationPage } from "../../api/index.ts";
import type { OcrLineItem, TranslatedLine } from "../../api/index.ts";
import { buildOcrSummarySignature, summarizeOcrLines } from "../../utils/ocr-line-summary.ts";
import type { OcrLineSummary } from "../../utils/ocr-line-summary.ts";
import type { DragState, OcrPreviewPanelRef } from "./types.ts";
import { getPageHistoryState, normalizeLineIndices, sameLines, sameTranslatedLines } from "./helpers.ts";
import { exportPageAsPng } from "./utils/exportPng.ts";
import { DEFAULT_POLYGON_BG_COLOR } from "../../config.ts";
import { useEditorHistory } from "./hooks/useEditorHistory.ts";
import { usePolygonDrag } from "./hooks/usePolygonDrag.ts";
import { useTextlessPolling } from "./hooks/useTextlessPolling.ts";
import { useLineOperations } from "./hooks/useLineOperations.ts";
import { useContextMenuActions } from "./hooks/useContextMenuActions.ts";
import { usePanelKeyboard } from "./hooks/usePanelKeyboard.ts";
import { OcrLinesContext, OcrViewContext, OcrTranslationContext, OcrActionsContext, OcrSummaryContext } from "./OcrEditorContext.tsx";
import OcrPreviewPanelView from "./OcrPreviewPanelView.tsx";

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  uploadId: string;
  /** 0-based page index */
  pageIndex: number;
  onOcrPage?: () => void;
  onTextlessPage?: () => void;
  onTranslatePage?: () => void;
  onLineSummariesChange?: (summaries: OcrLineSummary[]) => void;
  allPageLineSummaries?: Record<number, OcrLineSummary[]>;
  onSelectPage?: (page: number) => void;
}

// ── Container ────────────────────────────────────────────────────────────────

const OcrPreviewPanelContainer = forwardRef<OcrPreviewPanelRef, Props>(
  ({ uploadId, pageIndex, onOcrPage, onTextlessPage, onTranslatePage, onLineSummariesChange, allPageLineSummaries = {}, onSelectPage }, ref) => {
    const { t } = useTranslation();

    // ── Refs ──────────────────────────────────────────────────────────────
    const rootRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const linesRef = useRef<OcrLineItem[]>([]);
    const imageModeRef = useRef<"text" | "textless">("text");
    const translatedLinesRef = useRef<TranslatedLine[]>([]);
    const loadedTranslatedLinesRef = useRef<TranslatedLine[]>([]);
    const summarySignatureRef = useRef<string>("");
    const isDirtyRef = useRef(false);
    const dragStateRef = useRef<DragState | null>(null);
    const selectedLineIndexRef = useRef<number | null>(null);
    const selectedLineIndicesRef = useRef<ReadonlySet<number>>(new Set());

    // ── Core state ────────────────────────────────────────────────────────
    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
    const [lines, setLines] = useState<OcrLineItem[]>([]);
    const [loadedLines, setLoadedLines] = useState<OcrLineItem[]>([]);
    const [translatedLines, setTranslatedLines] = useState<TranslatedLine[]>([]);
    const [loadedTranslatedLines, setLoadedTranslatedLines] = useState<TranslatedLine[]>([]);
    const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
    const [selectedLineIndices, setSelectedLineIndices] = useState<ReadonlySet<number>>(new Set());
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [imageMode, setImageMode] = useState<"text" | "textless">("text");
    const [showBoxes, setShowBoxes] = useState(true);
    const [showTranslation, setShowTranslation] = useState(false);
    const [polygonBgColor, setPolygonBgColorState] = useState<string>(
      () => localStorage.getItem(`polygonBgColor:${uploadId}`) ?? DEFAULT_POLYGON_BG_COLOR,
    );

    const setPolygonBgColor = useCallback((color: string) => {
      localStorage.setItem(`polygonBgColor:${uploadId}`, color);
      setPolygonBgColorState(color);
    }, [uploadId]);

    // ── Derived state ─────────────────────────────────────────────────────
    const selectedLine = selectedLineIndex !== null ? lines[selectedLineIndex] ?? null : null;
    const isOcrDirty = useMemo(() => !sameLines(lines, loadedLines), [lines, loadedLines]);
    const isTranslationDirty = useMemo(() => !sameTranslatedLines(translatedLines, loadedTranslatedLines), [translatedLines, loadedTranslatedLines]);
    const isDirty = isOcrDirty || isTranslationDirty;
    const lineSummarySourceKey = useMemo(
      () => lines.map((line) => `${line.lineIndex}|${line.text ?? ""}`).join("\n"),
      [lines],
    );
    const lineSummaries = useMemo(() => summarizeOcrLines(lines), [lineSummarySourceKey]);

    // ── Keep refs in sync ─────────────────────────────────────────────────
    isDirtyRef.current = isDirty;
    selectedLineIndexRef.current = selectedLineIndex;
    selectedLineIndicesRef.current = selectedLineIndices;
    useEffect(() => { linesRef.current = lines; }, [lines]);
    useEffect(() => { imageModeRef.current = imageMode; }, [imageMode]);
    useEffect(() => { translatedLinesRef.current = translatedLines; }, [translatedLines]);
    useEffect(() => { loadedTranslatedLinesRef.current = loadedTranslatedLines; }, [loadedTranslatedLines]);

    // ── Custom hooks ──────────────────────────────────────────────────────
    const {
      dragStartSnapshotRef,
      snapshotCurrent,
      applyHistoryEdit,
      commitDragHistory,
      undo,
      redo,
    } = useEditorHistory(uploadId, pageIndex, linesRef, imageModeRef, translatedLinesRef, setLines, setImageMode, setTranslatedLines);

    // Wrapper that clears multi-selection whenever a single line is chosen interactively.
    const setSelectedLineSingle = useCallback((idx: number | ((prev: number | null) => number | null)) => {
      setSelectedLineIndex(idx as Parameters<typeof setSelectedLineIndex>[0]);
      setSelectedLineIndices((prev) => prev.size === 0 ? prev : new Set());
    }, []);

    const {
      dragState,
      getSvgPoint,
      startPolygonMoveDrag,
      startPolygonPointDrag,
    } = usePolygonDrag(svgRef, dragStartSnapshotRef, snapshotCurrent, commitDragHistory, setLines, setSelectedLineSingle);

    const { isTextlessAvailable, textlessVersion } = useTextlessPolling(uploadId, pageIndex, setImageMode);

    const { updateLine, deleteLines, deleteSelectedLine } = useLineOperations(
      linesRef, translatedLinesRef, applyHistoryEdit, setSelectedLineIndex, setSelectedLineIndices,
    );

    // Keep dragState ref in sync for summary guard
    dragStateRef.current = dragState;

    // ── Image URL ─────────────────────────────────────────────────────────
    const rawImageUrl = getUploadPageUrl(uploadId, pageIndex);
    const textlessImageUrl = `${getTextlessPageUrl(uploadId, pageIndex)}?v=${textlessVersion}`;
    const imgUrl = imageMode === "textless" && isTextlessAvailable ? textlessImageUrl : rawImageUrl;

    // ── Summaries notification ────────────────────────────────────────────
    useEffect(() => {
      if (!onLineSummariesChange) return;
      if (dragStateRef.current) return;
      const signature = buildOcrSummarySignature(lineSummaries);
      if (signature === summarySignatureRef.current) return;
      summarySignatureRef.current = signature;
      onLineSummariesChange(lineSummaries);
    }, [lineSummaries, onLineSummariesChange]);

    // ── Load page data ───────────────────────────────────────────────────
    const loadPageLines = useCallback(async () => {
      setSaveMessage(null);
      setErrorMessage(null);
      try {
        const pageNumber = pageIndex + 1;
        const [ocrResult, translationResult] = await Promise.all([
          fetchOcrPageLines(uploadId, pageNumber),
          fetchTranslationPage(uploadId, pageNumber),
        ]);
        const nextLines = normalizeLineIndices(ocrResult ?? []);
        const history = getPageHistoryState(uploadId, pageIndex);
        history.undo = [];
        history.redo = [];
        setLines(nextLines);
        setLoadedLines(nextLines);
        setTranslatedLines(translationResult);
        setLoadedTranslatedLines(translationResult);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }, [uploadId, pageIndex]);

    useEffect(() => {
      setLines([]);
      setLoadedLines([]);
      setTranslatedLines([]);
      setLoadedTranslatedLines([]);
      setSelectedLineIndex(null);
      setSelectedLineIndices(new Set());
      void loadPageLines();
    }, [uploadId, pageIndex, loadPageLines]);

    // ── Save ─────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
      if (!isDirtyRef.current) return;
      setSaving(true);
      setSaveMessage(null);
      setErrorMessage(null);
      try {
        const normalized = normalizeLineIndices(linesRef.current);
        const saves: Promise<void>[] = [];
        if (!sameLines(normalized, loadedLines)) {
          saves.push(saveOcrPageLines(uploadId, pageIndex + 1, normalized));
        }
        if (!sameTranslatedLines(translatedLinesRef.current, loadedTranslatedLinesRef.current)) {
          saves.push(saveTranslationPage(uploadId, pageIndex + 1, translatedLinesRef.current));
        }
        await Promise.all(saves);
        setLines(normalized);
        setLoadedLines(normalized);
        setLoadedTranslatedLines([...translatedLinesRef.current]);
        setSaveMessage(t("ocrPreview.saved"));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setSaving(false);
      }
    }, [uploadId, pageIndex, loadedLines, t]);

    // ── Context menu ─────────────────────────────────────────────────────
    const {
      contextMenu, setContextMenu, openPolygonMenu,
      handleAddPolygonPoint, handleDeletePolygonPoint,
      handleDeleteTextLine, handleAddNewLine, handleMergeSelectedLines,
    } = useContextMenuActions(
      linesRef, translatedLinesRef, lines.length,
      applyHistoryEdit, updateLine, getSvgPoint, setSelectedLineIndex,
      setSelectedLineIndices, selectedLineIndicesRef,
    );

    // ── Keyboard handler ─────────────────────────────────────────────────
    const handlePanelKeyDown = usePanelKeyboard(
      linesRef, selectedLineIndexRef, selectedLineIndicesRef,
      setSelectedLineIndex, setSelectedLineIndices,
      handleSave, deleteSelectedLine, deleteLines,
    );

    // ── Image load handler ───────────────────────────────────────────────
    const handleImageLoad = useCallback(() => {
      const img = imgRef.current;
      if (!img) return;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    }, []);

    // ── Imperative handle ────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      saveIfDirty: handleSave,
      reloadPage: loadPageLines,
      undo,
      redo,
      getViewState: () => ({ showBoxes, showTranslation, polygonBgColor, imageMode, isTextlessAvailable }),
    }), [handleSave, loadPageLines, undo, redo, showBoxes, showTranslation, polygonBgColor, imageMode, isTextlessAvailable]);

    const handleImageModeChange = useCallback((mode: "text" | "textless") => {
      applyHistoryEdit(linesRef.current, mode);
    }, [applyHistoryEdit]);

    const handleSelectLine = useCallback((index: number) => {
      setSelectedLineIndex(index);
      setSelectedLineIndices((prev) => prev.size === 0 ? prev : new Set());
      rootRef.current?.focus();
    }, []);

    const handleExportPng = useCallback(() => {
      if (!naturalSize) return;
      void exportPageAsPng(imgUrl, naturalSize, svgRef.current, `page-${pageIndex + 1}.png`);
    }, [imgUrl, naturalSize, pageIndex]);

    const handleTextlessPageWithSave = useCallback(async () => {
      await handleSave();
      onTextlessPage?.();
    }, [handleSave, onTextlessPage]);

    const updateTranslation = useCallback((lineIndex: number, text: string) => {
      const current = translatedLinesRef.current;
      const existingIdx = current.findIndex((tl) => tl.lineIndex === lineIndex);
      let next: TranslatedLine[];
      if (existingIdx >= 0) {
        next = [...current];
        next[existingIdx] = { lineIndex, translated: text };
      } else {
        next = [...current, { lineIndex, translated: text }].sort((a, b) => a.lineIndex - b.lineIndex);
      }
      applyHistoryEdit(linesRef.current, undefined, next);
    }, [applyHistoryEdit]);

    // ── Render ───────────────────────────────────────────────────────────
    const linesCtxValue = useMemo(() => ({
      lines,
      selectedLineIndex,
      selectedLineIndices,
      selectedLine,
      lineSummaries,
      onSelectLine: handleSelectLine,
      onUpdateLine: updateLine,
      setSelectedLineIndex: setSelectedLineSingle,
    }), [lines, selectedLineIndex, selectedLineIndices, selectedLine, lineSummaries, handleSelectLine, updateLine, setSelectedLineSingle]);

    const viewCtxValue = useMemo(() => ({
      rootRef,
      imgRef,
      svgRef,
      imageMode,
      showBoxes,
      showTranslation,
      polygonBgColor,
      isTextlessAvailable,
      naturalSize,
      imgUrl,
      onPanelKeyDown: handlePanelKeyDown,
      onImageModeChange: handleImageModeChange,
      onShowBoxesChange: setShowBoxes,
      onShowTranslationChange: setShowTranslation,
      onPolygonBgColorChange: setPolygonBgColor,
      onImageLoad: handleImageLoad,
    }), [imageMode, showBoxes, showTranslation, polygonBgColor, isTextlessAvailable, naturalSize, imgUrl, handlePanelKeyDown, handleImageModeChange, setPolygonBgColor, handleImageLoad]);

    const translationCtxValue = useMemo(() => ({
      translatedLines,
      onUpdateTranslation: updateTranslation,
    }), [translatedLines, updateTranslation]);

    const actionsCtxValue = useMemo(() => ({
      isDirty,
      saving,
      saveMessage,
      errorMessage,
      contextMenu,
      setContextMenu,
      getSvgPoint,
      startPolygonMoveDrag,
      startPolygonPointDrag,
      openPolygonMenu,
      onAddPolygonPoint: handleAddPolygonPoint,
      onDeletePolygonPoint: handleDeletePolygonPoint,
      onDeleteTextLine: handleDeleteTextLine,
      onAddNewLine: handleAddNewLine,
      onMergeSelectedLines: handleMergeSelectedLines,
      onSave: handleSave,
      onOcrPage,
      onTextlessPageWithSave: handleTextlessPageWithSave,
      onTranslatePage,
      onExportPng: handleExportPng,
    }), [isDirty, saving, saveMessage, errorMessage, contextMenu, setContextMenu, getSvgPoint,
      startPolygonMoveDrag, startPolygonPointDrag, openPolygonMenu, handleAddPolygonPoint,
      handleDeletePolygonPoint, handleDeleteTextLine, handleAddNewLine, handleMergeSelectedLines,
      handleSave, onOcrPage, handleTextlessPageWithSave, onTranslatePage, handleExportPng]);

    const summaryCtxValue = useMemo(() => ({
      allPageLineSummaries,
      onSelectPage,
    }), [allPageLineSummaries, onSelectPage]);

    return (
      <OcrSummaryContext.Provider value={summaryCtxValue}>
        <OcrLinesContext.Provider value={linesCtxValue}>
          <OcrViewContext.Provider value={viewCtxValue}>
            <OcrTranslationContext.Provider value={translationCtxValue}>
              <OcrActionsContext.Provider value={actionsCtxValue}>
                <OcrPreviewPanelView />
              </OcrActionsContext.Provider>
            </OcrTranslationContext.Provider>
          </OcrViewContext.Provider>
        </OcrLinesContext.Provider>
      </OcrSummaryContext.Provider>
    );
  },
);

export default OcrPreviewPanelContainer;
