# Ergonomic Comic Translator

**AI 辅助漫画翻译 — 赋能人类译者，而非取代。**

一个端到端的漫画 OCR、文字去除和翻译流水线。基于 [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)、本地修复模型和 LLM 驱动翻译 — 完全本地运行，无需 Docker 或云服务。

> **[English Version](README.md)**

---

## 为什么叫 "Ergonomic"？

全自动漫画翻译往往会丢失上下文、语气和文化细节。本项目采用不同的思路：**AI 负责繁琐工作（OCR、文字去除、翻译初稿），而人类译者保留对最终结果的完全控制权。**

每一步都可以在 Web UI 中审查和编辑：
- OCR 多边形可以调整、拆分、合并或重绘
- 翻译可以逐行编辑，原文并排显示
- 文字去除可以按页重新执行
- 每页保留完整的撤销/重做历史

目标是让漫画翻译**更快，但不牺牲质量**。

---

## 功能

### OCR — 文字提取

从漫画页面中精确提取文字和多边形检测框。支持两种模型：

- **PaddleOCR-VL 1.5**（默认）— 视觉语言模型，精度最高
- **标准 PaddleOCR** — 更快，可配置语言

支持多 GPU 并行处理。PDF 文件自动拆分为页面。

→ [CLI 用法](docs/cli-commands.zh.md#ocr) · [API 接口](docs/api-reference.zh.md) · [配置](docs/setup.zh.md#配置)

### 文字去除 — 生成干净页面

使用本地修复模型（lama_large）去除检测到的文字。每页生成一个干净的"无文字"版本，使用 OCR 多边形作为蒙版。

→ [CLI 用法](docs/cli-commands.zh.md#文字去除) · [API 接口](docs/api-reference.zh.md)

### 翻译 — LLM 驱动初稿

使用本地 [Ollama](https://ollama.com) 模型逐页翻译提取的文字。每次调用包含完整 OCR 上下文和最近翻译页面的滑动窗口，确保跨页一致性。

如果整页翻译多次重试后失败，引擎会自动回退到逐行翻译。

→ [CLI 用法](docs/cli-commands.zh.md#翻译) · [API 接口](docs/api-reference.zh.md)

### Web UI — 可视化编辑器

React + Material UI 界面，涵盖完整工作流：

| 功能 | 说明 |
|------|------|
| **画廊** | 上传卡片，含封面缩略图和页数 |
| **上传** | 拖拽上传图片、PDF 或 ZIP，可重排文件列表 |
| **OCR 编辑器** | 交互式 SVG 多边形编辑 — 拖拽顶点、增删节点、移动多边形 |
| **文本编辑** | 逐行文本编辑，支持横排/竖排方向切换 |
| **翻译编辑** | 原文与译文并排编辑 |
| **翻译叠加层** | 多边形内渲染译文，感知排版方向，自动拟合字号 |
| **多边形文字排版** | 基于扫描线的自适应文字排版 — 中日韩文字在竖排方向按从右到左的列堆叠，非中日韩文字按词边界换行并旋转渲染 |
| **多边形合并** | 多选多边形（Ctrl+点击）后合并为一个 — 预览对话框支持拖拽排序文本顺序 |
| **对齐到对话框** | 右键多边形，使用泛洪填充边缘检测自动识别周围对话气泡边界，将多边形贴合到气泡内部（需先生成无文字页面） |
| **转为长方形** | 右键多边形，将任意不规则形状转换为其轴对齐外接矩形 |
| **原图/无文字切换** | 在原始图片和去除文字的图片间切换 |
| **多边形样式** | ARGB 颜色选择器设置多边形叠加层背景色 |
| **行摘要** | 状态着色指示器（正常/过长/过短/极短） |
| **跨页问题导航** | 浏览所有页面的 OCR 问题 |
| **右键菜单** | 右键增删行、对齐到对话框、转为长方形、合并选中项、按页触发 OCR/文字去除/翻译 |
| **撤销/重做** | 每页历史快照持久化 |
| **PDF 导出** | 所见即所得导出所有页面 |
| **快捷键** | Ctrl+S、Ctrl+Z、PageUp/PageDown、Delete |

→ [组件架构](docs/frontend-components.zh.md)

### CLI 工具

所有流水线操作均可通过 CLI 执行：

```bash
bun run ocr              # 执行 OCR
bun run textless <scope>  # 去除文字
bun run translate <scope> # 翻译
bun run delete <uploadId> # 删除某次上传的所有数据
bun run doctor            # 系统诊断
```

→ [完整 CLI 参考](docs/cli-commands.zh.md)

### REST API

基于上传的 HTTP 工作流。支持图片、PDF 和 ZIP 上传，队列驱动的 OCR、文字去除和翻译处理。

```bash
bun run api  # 启动 API 服务器 http://0.0.0.0:3000
```

→ [完整 API 参考](docs/api-reference.zh.md)

---

## 快速开始

### 环境要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| GPU | 支持 CUDA 的 NVIDIA GPU | NVIDIA GPU, 8+ GB 显存 |
| 内存 | 8 GB | 16 GB |
| 软件 | [Bun](https://bun.sh)、Python 3.12、[Poetry](https://python-poetry.org) | — |

AMD GPU 通过 [ZLUDA](https://github.com/vosen/ZLUDA) 实验性支持。WSL2 用户自动获得 Windows CUDA 直通。

### 安装

```bash
bun install                    # 1. 安装 Bun 依赖
bun run system:bootstrap       # 2. 通过 Homebrew 安装 Poetry + pyenv
bun run python:bootstrap       # 3. 安装 Python 3.12 + PaddleOCR
bun run text-cleaner:bootstrap # 4.（可选）安装文字去除模型
bun run doctor                 # 5. 验证安装
```

→ [详细安装指南](docs/setup.zh.md)

---

## 架构

四个层协同工作：

| 层 | 技术 | 职责 |
|----|------|------|
| **系统层** | WSL2/Linux, Homebrew, NVIDIA/AMD GPU | 硬件和操作系统基础 |
| **Python 层** | Poetry + pyenv, PaddleOCR, PyTorch | OCR 引擎、文字去除、PDF 渲染 |
| **Bun 层** | TypeScript, Bun 运行时 | API 服务器、队列管理、编排 |
| **前端层** | React 18, Material UI, Vite | 审查和编辑的 Web UI |

→ [架构概览](docs/architecture.zh.md) · [架构图](docs/architecture.drawio) · [Python 层详情](docs/python-layer.zh.md)

---

## 文档

| 文档 | 说明 |
|------|------|
| [架构概览](docs/architecture.zh.md) | 系统分层、数据流和 React Context 设计 |
| [安装指南](docs/setup.zh.md) | 安装、引导和配置参考 |
| [Python 层](docs/python-layer.zh.md) | Python 包和 Bun–Python 通信协议 |
| [前端组件](docs/frontend-components.zh.md) | 组件架构和 Context 映射 |
| [API 参考](docs/api-reference.zh.md) | REST API 接口、参数和响应 |
| [CLI 命令](docs/cli-commands.zh.md) | 所有 CLI 命令和使用示例 |
| [架构图](docs/architecture.drawio) | 可视化架构图（用 draw.io 打开） |

> 所有文档也提供英文版 — 见 [English Documentation](README.md#documentation)。

---

## 配置

所有环境变量在 `src/config.ts` 中解析，均有合理默认值。主要变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `COMIC_TRANSLATOR_TEMP_DIR` | `.tmp` | 临时文件根目录 |
| `COMIC_TRANSLATOR_FILES_DIR` | `.tmp/ocr` | CLI OCR 输入目录 |
| `OCR_MODEL` | `paddleocr-vl-1.5` | OCR 模型（`paddleocr` 或 `paddleocr-vl-1.5`） |
| `OCR_CONCURRENCY` | `1` | 并行 GPU 批次（需多 GPU） |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API 地址 |
| `OLLAMA_TRANSLATE_MODEL` | `translategemma:12b` | 翻译模型 |
| `TRANSLATE_TARGET_LANGUAGE` | `Chinese` | 默认目标语言 |

→ [完整配置参考](docs/setup.zh.md#配置)

---

## 许可

MIT — 详见 [LICENSE](LICENSE)。
