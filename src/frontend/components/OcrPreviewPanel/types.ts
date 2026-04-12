import type { OcrLineItem, TranslatedLine } from "../../api/index.ts";
export type { TranslatedLine };

export type DragState =
  | {
      kind: "polygon-point";
      lineIndex: number;
      pointIndex: number;
    }
  | {
      kind: "polygon-move";
      lineIndex: number;
      startPointer: [number, number];
      original: [number, number][];
    };

export interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  lineIndex: number;
  pointIndex: number | null;
  clickPoint: [number, number];
  kind: "polygon" | "background";
}

export type EditorSnapshot = {
  lines: OcrLineItem[];
  imageMode: "text" | "textless";
  translatedLines: TranslatedLine[];
};

export type PageHistoryState = {
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
};

export interface OcrPreviewPanelRef {
  saveIfDirty(): Promise<void>;
  reloadPage(): Promise<void>;
  undo(): boolean;
  redo(): boolean;
  getViewState(): { showBoxes: boolean; showTranslation: boolean; polygonBgColor: string; imageMode: "text" | "textless"; isTextlessAvailable: boolean };
}

export interface MergePreviewItem {
  /** Original array index in the lines array */
  arrayIndex: number;
  text: string;
  translated: string;
}
