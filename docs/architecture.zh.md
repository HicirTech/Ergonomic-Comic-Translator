# 架构概览

本文档描述 **Ergonomic Comic Translator** 的高层架构 — 一个基于 Bun 的漫画页面和 PDF 文件的 OCR、文字去除和翻译流水线。

> [English Version](architecture.md)

## 分层图

参见 [architecture.drawio](architecture.drawio) 的可视化架构图（用 [draw.io](https://app.diagrams.net/) 打开）。

## 系统分层

### 1. 前端（React 18 + MUI）

由 Vite 提供的单页应用。两个页面：

- **首页** — 上传内容以肖像卡片展示，含封面图和页数。
- **上传详情页** — 图片条侧边栏用于页面导航 + OcrPreviewPanel 编辑器。

OcrPreviewPanel 是最复杂的组件。它使用 **4 个精细的 React Context** 以最小化不必要的重渲染：

| Context | 用途 | 何时变化 |
|---------|------|---------|
| `OcrLinesContext` | 行数据 + 选中状态 | 每次点击/文本编辑 |
| `OcrViewContext` | 视觉设置 + ref | 工具栏切换（稀少） |
| `OcrTranslationContext` | 翻译数据 | 翻译编辑 |
| `OcrActionsContext` | 保存状态、多边形交互、页面操作 | 保存/右键/拖拽 |

子组件仅订阅所需的 Context：
- `ImageToolbar` → 仅 View
- `LineSummaryPanel` → 仅 Lines
- `TranslationEditor` → Lines + Translation
- `LineEditor` → Lines + Actions
- `SvgOverlay` → 全部四个（它渲染所有内容）
- `EditorContextMenu` → Lines + Actions

### 2. API 服务器（Bun HTTP）

基于队列处理的 REST API：

- **路由**：upload、ocr、textless、translate、context、polish
- **服务**：工厂函数 + 依赖注入（无类）
- **存储库**：异步接口 + 文件后端实现（为将来数据库迁移预留接口）
- **队列模式**：`Ready → Queued → Processing → Completed` 状态机，通过 `createQueueProcessor<T>()` 泛型工厂共享

### 3. OCR 模块

OCR 流水线的高层 TypeScript 编排：

1. **准备** — 发现输入文件，将 PDF 拆分为逐页 PNG
2. **执行** — 通过 Python 批量调用 PaddleOCR（支持多 GPU）
3. **合并** — 确定性地将批次结果合并为单个输出 JSON

### 4. CLI 脚本

从服务模块导入逻辑的薄包装层：

| 命令 | 脚本 | 说明 |
|------|------|------|
| `bun run ocr` | `scripts/textless.ts` | 运行 OCR 流水线 |
| `bun run textless` | `scripts/textless.ts` | 文字去除 |
| `bun run translate` | `scripts/translate.ts` | 通过 Ollama 翻译 |
| `bun run delete` | `scripts/delete.ts` | 永久删除上传 |
| `bun run context` | `scripts/context.ts` | 上下文导出工具 |

### 5. Python 层

`src/python/` 下的两个领域包，以模块方式调用，`PYTHONPATH=src/python/`：

| 包 | 虚拟环境 | 入口 | 用途 |
|----|---------|------|------|
| `ocr/` | Poetry | `python -m ocr.runner` | PaddleOCR / PaddleOCR-VL 批量处理 |
| `textless/` | text-cleaner-venv | `python -m textless.runner` | 基于修复模型的文字去除 |

与 Bun 的通信使用双通道协议：
- **stderr** → 日志（`[INFO]`、`[WARN]`、`[ERROR]` 前缀），转发给 log4js
- **stdout** → 结构化 JSON 结果数据

### 6. 安装与诊断

引导脚本按层安装依赖：

1. `system:bootstrap` — Homebrew、Poetry、pyenv
2. `python:bootstrap` — Python 3.12、Poetry 虚拟环境、PaddleOCR 轮子
3. `text-cleaner:bootstrap` — 独立虚拟环境 + PyTorch + 修复模型

检测脚本探测硬件和软件：
- `doctor` — 完整系统检查
- `nvidia:detect`、`cuda:detect`、`amd:detect` — GPU 能力
- `python:detect`、`system:detect` — 软件版本

## 数据流

```
上传 → OCR 准备 → OCR 执行 → 合并 → 文字去除 → 翻译 → 润色
  ↓        ↓          ↓         ↓        ↓         ↓       ↓
upload/ ocr_prepare/ (批次)  ocr_output/ textless/ translated/ translated/
```

翻译阶段还会生成 `extracted-terms.json` 作为副产物，包含自动检测到的术语表。

所有数据存储在 `.tmp/` 下（可通过环境变量配置）。每次上传获得一个 UUID 作为作用域；CLI 使用 `ocr` 作为作用域。
