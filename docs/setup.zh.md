# 安装指南

从零开始安装 Ergonomic Comic Translator 的逐步教程。

> [English Version](setup.md)

## 前置条件

### 硬件

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| GPU | 支持 CUDA 的 NVIDIA GPU | NVIDIA GPU, 8+ GB 显存 |
| 显存 | 4 GB（标准 PaddleOCR） | 8 GB（PaddleOCR-VL-1.5） |
| 内存 | 8 GB | 16 GB |

AMD GPU 通过 [ZLUDA](https://github.com/vosen/ZLUDA) 实验性支持。

### 软件

| 依赖 | 版本 | 备注 |
|------|------|------|
| [Bun](https://bun.sh) | 最新 | JavaScript/TypeScript 运行时 |
| [Homebrew](https://brew.sh) | 最新 | 用于安装 Poetry 和 pyenv |
| [Python](https://www.python.org) | 3.12 | 由 pyenv 管理 |
| [Poetry](https://python-poetry.org) | 最新 | Python 依赖管理 |
| [NVIDIA 驱动](https://www.nvidia.com/drivers) | 535+ | 需支持 CUDA 12.x |

> **WSL2 用户**：CUDA 驱动从 Windows 自动直通。无需在 Linux 单独安装 CUDA。

## 安装步骤

### 1. 安装 Bun 依赖

```bash
bun install
```

### 2. 引导系统层

通过 Homebrew 安装 Poetry 和 pyenv：

```bash
bun run system:bootstrap
```

### 3. 引导 Python 层

通过 pyenv 安装 Python 3.12，创建 Poetry 虚拟环境，安装 PaddleOCR + PaddlePaddle GPU 轮子：

```bash
bun run python:bootstrap
```

### 4. 引导文字清除器（可选）

文字去除所需。创建独立的 Python 虚拟环境，安装 PyTorch（CUDA 12.9），下载 `lama_large` 修复模型（~196 MB）和文字检测模型（~290 MB）：

```bash
bun run text-cleaner:bootstrap
```

### 5. 引导记忆层（可选）

持久化翻译记忆所需。创建独立 Python 虚拟环境，安装 `mem0ai` 和 `qdrant-client`（无需 Docker 或外部服务器）。引导完成后，拉取嵌入模型一次：

```bash
bun run memory:bootstrap
ollama pull nomic-embed-text
```

当虚拟环境存在时，记忆功能默认启用。设置 `MEMORY_ENABLED=false` 可在不删除虚拟环境的情况下禁用它。

### 6. 验证安装

```bash
bun run doctor
```

## Python 环境

项目维护三个独立的 Python 环境：

### Poetry 虚拟环境（OCR）

- 由 Poetry 管理（`pyproject.toml`）
- 包含：PaddleOCR、PaddlePaddle-GPU、OpenCV
- 调用方式：`poetry run python -m ocr.runner`

### 文字清除器虚拟环境（Textless）

- 位于 `.tmp/text-cleaner-venv/`
- 包含：PyTorch（CUDA 12.9）、torchvision、craft-text-detector
- 调用方式：`.tmp/text-cleaner-venv/bin/python -m textless.runner`
- 由 `bun run text-cleaner:bootstrap` 创建

### 记忆层虚拟环境（Persistent Memory）

- 位于 `.tmp/memory-venv/`
- 包含：`mem0ai`、`qdrant-client`（锁定版本）
- 调用方式：`.tmp/memory-venv/bin/python -m memory.cli`
- 由 `bun run memory:bootstrap` 创建
- 需要 Ollama 提供嵌入模型：`ollama pull nomic-embed-text`
- 可选 — 若虚拟环境不存在，所有记忆操作会静默降级为空操作

## 诊断

运行以下命令排查问题：

```bash
bun run doctor           # 完整系统检查
bun run system:detect    # 系统层信息
bun run nvidia:detect    # NVIDIA GPU 信息
bun run cuda:detect      # CUDA 能力
bun run amd:detect       # AMD GPU 信息
bun run python:detect    # Python 环境信息
```

## 配置

所有环境变量在 `src/config.ts` 中一次性解析。完整配置参考请见 [README](../README.zh.md#配置)。
