# Frontend Components

> [中文版](frontend-components.zh.md)

The web UI is a React 18 + Material UI SPA served by Vite. All components follow the **Container / View** pattern.

## Component Pattern

```
ComponentName/
  index.tsx                 ← thin re-export
  ComponentNameContainer.tsx ← hooks, state, business logic — no visual JSX
  ComponentNameView.tsx      ← pure render — receives data from context or props
```

Complex components add:
- `hooks/` — extracted custom hooks
- `components/` — focused sub-components
- `utils/` — pure utility functions

## Page Components

### HomePage
- `HomePageContainer.tsx` — batch loading, dialog open state
- `HomePageView.tsx` — AppBar + responsive card grid

### UploadDetailPage
- `UploadDetailPageContainer.tsx` — page-level state, global keyboard shortcuts (Ctrl+Z/Shift+Z/S, PageUp/PageDown), dialog management, PDF export
- `UploadDetailPageView.tsx` — AppBar + ImageStripPanel + OcrPreviewPanel + dialogs

## OcrPreviewPanel Architecture

The most complex component. Uses **4 focused React Contexts** instead of a monolithic context to minimize re-renders.

### Context Design

| Context | Contents | Update Frequency |
|---------|----------|-----------------|
| **OcrLinesContext** | `lines`, `selectedLineIndex`, `selectedLineIndices`, `selectedLine`, `lineSummaries`, line callbacks | Every click/edit |
| **OcrViewContext** | `imageMode`, `showBoxes`, `showTranslation`, `polygonBgColor`, `isTextlessAvailable`, `naturalSize`, `imgUrl`, refs, view callbacks | Toolbar toggles (rare) |
| **OcrTranslationContext** | `translatedLines`, `onUpdateTranslation` | Translation edit |
| **OcrActionsContext** | `isDirty`, `saving`, save/error messages, `contextMenu`, polygon drag/click, page action callbacks | Save / right-click / drag |
| **OcrSummaryContext** | `allPageLineSummaries`, `onSelectPage` | Cross-page summary changes |

### Sub-component → Context Mapping

| Component | Contexts Used |
|-----------|--------------|
| `OcrPreviewPanelView` | View |
| `ImageToolbar` | View |
| `PolygonBgColorPicker` | View |
| `SvgOverlay` | Lines + View + Translation + Actions |
| `LineEditor` | Lines + Actions |
| `TranslationEditor` | Lines + Translation |
| `CurrentPageLines` | Lines |
| `ProblemNavigator` | Lines + Summary |
| `LineSummaryPanel` | (wrapper — composes CurrentPageLines + ProblemNavigator) |
| `EditorContextMenu` | Lines + Actions |

### File Structure

```
OcrPreviewPanel/
├── index.tsx                          ← re-export
├── OcrPreviewPanelContainer.tsx       ← state + hooks → 4 context providers
├── OcrPreviewPanelView.tsx            ← memo'd compositor, assembles sub-components
├── OcrEditorContext.tsx               ← 5 context definitions + typed hooks
├── types.ts                           ← DragState, ContextMenuState, EditorSnapshot, etc.
├── helpers.ts                         ← pure functions + uploadHistoryStore
├── components/
│   ├── SvgOverlay.tsx                 ← SVG polygon rendering + translation text overlay
│   ├── ImageToolbar.tsx               ← image mode + overlay toggle buttons
│   ├── PolygonBgColorPicker.tsx       ← ARGB color swatch with popover picker
│   ├── LineEditor.tsx                 ← text field + orientation toggle + save button
│   ├── TranslationEditor.tsx          ← translated text input (blur-commit pattern)
│   ├── LineSummaryPanel.tsx           ← wrapper composing CurrentPageLines + ProblemNavigator
│   ├── CurrentPageLines.tsx           ← scrollable line cards with status indicators
│   ├── ProblemNavigator.tsx           ← cross-page problem pagination
│   └── EditorContextMenu.tsx          ← right-click menu for polygon/line/page actions
├── hooks/
│   ├── useEditorHistory.ts            ← undo/redo state machine (5 max history)
│   ├── usePolygonDrag.ts              ← RAF-throttled polygon drag handler
│   ├── useLineOperations.ts           ← line delete/update operations
│   ├── useContextMenuActions.ts       ← context menu polygon/line actions
│   ├── usePanelKeyboard.ts            ← centralized keyboard shortcuts
│   └── useTextlessPolling.ts          ← 2s polling for textless availability
└── utils/
    ├── polygonTextLayout.ts           ← binary-search text fitting (CJK-aware)
    ├── exportPng.ts                   ← canvas-based WYSIWYG PNG export
    └── exportPdf.ts                   ← multi-page PDF generation
```

### Performance Optimizations

- **Context splitting** — changing translation doesn't re-render the toolbar; changing selection doesn't re-render save state
- **OcrPreviewPanelView is memoized** — prevents parent re-renders from cascading
- **TranslationEditor uses local state + blur commit** — avoids context updates on every keystroke
- **usePolygonDrag uses RAF throttling** — prevents jank during drag operations
- **SvgOverlay defers layout computation** via `useEffect` — `fitTextInPolygon` binary search never blocks paint
- **Refs for keyboard handlers** — callbacks remain identity-stable regardless of selection changes

## Other Components

| Component | Description |
|-----------|-------------|
| `UploadCard` | Portrait card with cover image, metadata, delete button |
| `UploadDialog` | Drag-and-drop upload with reorderable file list (DndContext) |
| `DeleteConfirmDialog` | Confirmation dialog for permanent upload deletion |
| `OcrDialog` | Dialog to trigger page-level OCR with model selection |
| `TextlessDialog` | Dialog to trigger page-level text removal |
| `TranslateDialog` | Dialog to trigger translation with model/language/scope selection |
| `PolishDialog` | Dialog to trigger translation polishing with model/language selection (rendered from UploadDetailPage) |
| `ImageStripPanel` | Vertical thumbnail strip with four-color status dots |
| `ContextPanel` | Context editing panel |
