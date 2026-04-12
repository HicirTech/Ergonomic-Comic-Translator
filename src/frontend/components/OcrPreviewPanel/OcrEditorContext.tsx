import { createContext, useContext } from "react";
import type { OcrLineItem, TranslatedLine } from "../../api/index.ts";
import type { OcrLineSummary } from "../../utils/ocr-line-summary.ts";
import type { ContextMenuState } from "./types.ts";

// ── Lines Context ────────────────────────────────────────────────────────────
// Core OCR line data + selection state. Changes on every click/edit.

export interface OcrLinesContextValue {
  lines: OcrLineItem[];
  selectedLineIndex: number | null;
  selectedLineIndices: ReadonlySet<number>;
  selectedLine: OcrLineItem | null;
  lineSummaries: OcrLineSummary[];
  onSelectLine: (index: number) => void;
  onToggleLineSelection: (index: number) => void;
  onUpdateLine: (index: number, updater: (line: OcrLineItem) => OcrLineItem) => void;
  setSelectedLineIndex: (index: number) => void;
}

export const OcrLinesContext = createContext<OcrLinesContextValue | null>(null);

export function useOcrLines(): OcrLinesContextValue {
  const ctx = useContext(OcrLinesContext);
  if (!ctx) throw new Error("useOcrLines must be used within OcrLinesContext.Provider");
  return ctx;
}

// ── View Context ─────────────────────────────────────────────────────────────
// Visual display settings + DOM refs. Changes infrequently (toolbar toggles).

export interface OcrViewContextValue {
  rootRef: React.RefObject<HTMLDivElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  imageMode: "text" | "textless";
  showBoxes: boolean;
  showTranslation: boolean;
  polygonBgColor: string;
  isTextlessAvailable: boolean;
  naturalSize: { w: number; h: number } | null;
  imgUrl: string;
  onPanelKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onImageModeChange: (mode: "text" | "textless") => void;
  onShowBoxesChange: (show: boolean) => void;
  onShowTranslationChange: (show: boolean) => void;
  onPolygonBgColorChange: (color: string) => void;
  onImageLoad: () => void;
}

export const OcrViewContext = createContext<OcrViewContextValue | null>(null);

export function useOcrView(): OcrViewContextValue {
  const ctx = useContext(OcrViewContext);
  if (!ctx) throw new Error("useOcrView must be used within OcrViewContext.Provider");
  return ctx;
}

// ── Translation Context ──────────────────────────────────────────────────────
// Translation data. Isolated so translation edits don't re-render toolbar/save UI.

export interface OcrTranslationContextValue {
  translatedLines: TranslatedLine[];
  onUpdateTranslation: (lineIndex: number, text: string) => void;
}

export const OcrTranslationContext = createContext<OcrTranslationContextValue | null>(null);

export function useOcrTranslation(): OcrTranslationContextValue {
  const ctx = useContext(OcrTranslationContext);
  if (!ctx) throw new Error("useOcrTranslation must be used within OcrTranslationContext.Provider");
  return ctx;
}

// ── Actions Context ──────────────────────────────────────────────────────────
// Save state, polygon interactions, context menu, page-level actions.

export interface OcrActionsContextValue {
  isDirty: boolean;
  saving: boolean;
  saveMessage: string | null;
  errorMessage: string | null;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  getSvgPoint: (event: MouseEvent | React.MouseEvent) => [number, number] | null;
  startPolygonMoveDrag: (lineIndex: number, polygon: [number, number][], event: React.MouseEvent) => void;
  startPolygonPointDrag: (lineIndex: number, pointIndex: number, event: React.MouseEvent) => void;
  openPolygonMenu: (event: React.MouseEvent, lineIndex: number, pointIndex: number | null) => void;
  onAddPolygonPoint: () => void;
  onDeletePolygonPoint: () => void;
  onDeleteTextLine: () => void;
  onAddNewLine: () => void;
  onMergeSelectedLines: () => void;
  onSave: () => void;
  onOcrPage?: () => void;
  onTextlessPageWithSave: () => void;
  onTranslatePage?: () => void;
  onExportPng: () => void;
}

export const OcrActionsContext = createContext<OcrActionsContextValue | null>(null);

export function useOcrActions(): OcrActionsContextValue {
  const ctx = useContext(OcrActionsContext);
  if (!ctx) throw new Error("useOcrActions must be used within OcrActionsContext.Provider");
  return ctx;
}

// ── Summary Context (cross-page) ────────────────────────────────────────────
// Kept separate so allPageLineSummaries updates don't re-render line-level consumers.

export interface OcrSummaryContextValue {
  allPageLineSummaries: Record<number, OcrLineSummary[]>;
  onSelectPage?: (page: number) => void;
}

export const OcrSummaryContext = createContext<OcrSummaryContextValue>({ allPageLineSummaries: {} });

export function useOcrSummary(): OcrSummaryContextValue {
  return useContext(OcrSummaryContext);
}
