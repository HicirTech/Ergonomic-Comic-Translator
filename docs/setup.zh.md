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

### 5. 验证安装

```bash
bun run doctor
```

## Python 环境

项目维护两个独立的 Python 环境：

### Poetry 虚拟环境（OCR）

- 由 Poetry 管理（`pyproject.toml`）
- 包含：PaddleOCR、PaddlePaddle-GPU、OpenCV
- 调用方式：`poetry run python -m ocr.runner`

### 文字清除器虚拟环境（Textless）

- 位于 `.tmp/text-cleaner-venv/`
- 包含：PyTorch（CUDA 12.9）、torchvision、craft-text-detector
- 调用方式：`.tmp/text-cleaner-venv/bin/python -m textless.runner`
- 由 `bun run text-cleaner:bootstrap` 创建

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

### 润色相关环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `POLISH_CHUNK_PAGES` | `10` | 每个润色分块的页数。设为 `-1` 表示将所有页面作为一个分块处理。 |
| `POLISH_QUEUE_FILE` | `.tmp/program/polishQueue.json` | 润色队列状态持久化文件路径。 |
