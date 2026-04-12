# 前端组件

Web UI 是基于 React 18 + Material UI 的单页应用，由 Vite 提供服务。所有组件遵循 **Container / View** 模式。

> [English Version](frontend-components.md)

## 组件模式

```
ComponentName/
  index.tsx                 ← 薄导出层
  ComponentNameContainer.tsx ← hooks、状态、业务逻辑 — 无视觉 JSX
  ComponentNameView.tsx      ← 纯渲染 — 从 context 或 props 接收数据
```

复杂组件还包含：
- `hooks/` — 提取的自定义 hooks
- `components/` — 专注的子组件
- `utils/` — 纯工具函数

## 页面组件

### 首页（HomePage）
- `HomePageContainer.tsx` — 批量加载、对话框打开状态
- `HomePageView.tsx` — AppBar + 响应式卡片网格

### 上传详情页（UploadDetailPage）
- `UploadDetailPageContainer.tsx` — 页面级状态、全局键盘快捷键（Ctrl+Z/Shift+Z/S、PageUp/PageDown）、对话框管理、PDF 导出
- `UploadDetailPageView.tsx` — AppBar + ImageStripPanel + OcrPreviewPanel + 对话框

## OcrPreviewPanel 架构

最复杂的组件。使用 **4 个精细的 React Context** 代替单一整体 Context，以最小化重渲染。

### Context 设计

| Context | 内容 | 更新频率 |
|---------|------|---------|
| **OcrLinesContext** | `lines`、`selectedLineIndex`、`selectedLineIndices`、`selectedLine`、`lineSummaries`、行回调 | 每次点击/编辑 |
| **OcrViewContext** | `imageMode`、`showBoxes`、`showTranslation`、`polygonBgColor`、`isTextlessAvailable`、`naturalSize`、`imgUrl`、ref、视图回调 | 工具栏切换（稀少） |
| **OcrTranslationContext** | `translatedLines`、`onUpdateTranslation` | 翻译编辑 |
| **OcrActionsContext** | `isDirty`、`saving`、保存/错误消息、`contextMenu`、多边形拖拽/点击、页面操作回调 | 保存/右键/拖拽 |
| **OcrSummaryContext** | `allPageLineSummaries`、`onSelectPage` | 跨页摘要变化 |

### 子组件 → Context 映射

| 组件 | 使用的 Context |
|------|---------------|
| `OcrPreviewPanelView` | View |
| `ImageToolbar` | View |
| `PolygonBgColorPicker` | View |
| `SvgOverlay` | Lines + View + Translation + Actions |
| `LineEditor` | Lines + Actions |
| `TranslationEditor` | Lines + Translation |
| `CurrentPageLines` | Lines |
| `ProblemNavigator` | Lines + Summary |
| `LineSummaryPanel` | （包装层 — 组合 CurrentPageLines + ProblemNavigator） |
| `EditorContextMenu` | Lines + Actions |

### 文件结构

```
OcrPreviewPanel/
├── index.tsx                          ← 导出
├── OcrPreviewPanelContainer.tsx       ← 状态 + hooks → 4 个 Context Provider
├── OcrPreviewPanelView.tsx            ← memo 化的合成器，组装子组件
├── OcrEditorContext.tsx               ← 5 个 Context 定义 + 类型化 hooks
├── types.ts                           ← DragState、ContextMenuState、EditorSnapshot 等
├── helpers.ts                         ← 纯函数 + uploadHistoryStore
├── components/
│   ├── SvgOverlay.tsx                 ← SVG 多边形渲染 + 翻译文字叠加层
│   ├── ImageToolbar.tsx               ← 图片模式 + 叠加层切换按钮
│   ├── PolygonBgColorPicker.tsx       ← ARGB 颜色选择器（MUI Popover + 原生 RGB 输入 + 透明度滑块）
│   ├── LineEditor.tsx                 ← 文本框 + 排版方向切换 + 保存按钮
│   ├── TranslationEditor.tsx          ← 译文输入（失焦提交模式）
│   ├── LineSummaryPanel.tsx           ← 包装层，组合 CurrentPageLines + ProblemNavigator
│   ├── CurrentPageLines.tsx           ← 可滚动的行卡片，带状态着色指示器
│   ├── ProblemNavigator.tsx           ← 跨页问题分页导航
│   └── EditorContextMenu.tsx          ← 右键菜单 — 多边形/行/页面操作
├── hooks/
│   ├── useEditorHistory.ts            ← 撤销/重做状态机（最多 5 条历史）
│   ├── usePolygonDrag.ts              ← RAF 节流的多边形拖拽处理
│   ├── useLineOperations.ts           ← 行删除/更新操作
│   ├── useContextMenuActions.ts       ← 右键菜单多边形/行操作
│   ├── usePanelKeyboard.ts            ← 集中式键盘快捷键
│   └── useTextlessPolling.ts          ← 2 秒轮询无文字可用性
└── utils/
    ├── polygonTextLayout.ts           ← 二分搜索文字拟合（CJK 感知）
    ├── exportPng.ts                   ← 基于 canvas 的所见即所得 PNG 导出
    └── exportPdf.ts                   ← 多页 PDF 生成
```

### 性能优化

- **Context 拆分** — 修改翻译不会重渲染工具栏；修改选中不会重渲染保存状态
- **OcrPreviewPanelView 使用 memo** — 防止父级重渲染级联传播
- **TranslationEditor 使用本地状态 + 失焦提交** — 避免每次按键都更新 Context
- **usePolygonDrag 使用 RAF 节流** — 防止拖拽操作卡顿
- **SvgOverlay 延迟布局计算** — `fitTextInPolygon` 二分搜索不会阻塞绘制
- **键盘处理使用 ref** — 回调函数保持标识稳定，不受选中变化影响

## 其他组件

| 组件 | 说明 |
|------|------|
| `UploadCard` | 肖像卡片，含封面图、元数据、删除按钮 |
| `UploadDialog` | 拖拽上传，可重排文件列表（DndContext） |
| `DeleteConfirmDialog` | 永久删除上传的确认对话框 |
| `OcrDialog` | 触发页面级 OCR 的对话框，含模型选择 |
| `TextlessDialog` | 触发页面级文字去除的对话框 |
| `TranslateDialog` | 触发翻译的对话框，含模型/语言/范围选择 |
| `ImageStripPanel` | 垂直缩略图条，带四色状态点 |
| `ContextPanel` | 上下文编辑面板 |
