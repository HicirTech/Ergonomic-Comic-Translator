# Setup Guide

> [中文版](setup.zh.md)

Step-by-step instructions for setting up Ergonomic Comic Translator from scratch.

## Prerequisites

### Hardware

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA GPU with CUDA support | NVIDIA GPU with 8+ GB VRAM |
| VRAM | 4 GB (standard PaddleOCR) | 8 GB (PaddleOCR-VL-1.5) |
| RAM | 8 GB | 16 GB |

AMD GPUs are experimentally supported via [ZLUDA](https://github.com/vosen/ZLUDA).

### Software

| Dependency | Version | Notes |
|------------|---------|-------|
| [Bun](https://bun.sh) | latest | JavaScript/TypeScript runtime |
| [Homebrew](https://brew.sh) | latest | Installs Poetry and pyenv |
| [Python](https://www.python.org) | 3.12 | Managed by pyenv |
| [Poetry](https://python-poetry.org) | latest | Python dependency management |
| [NVIDIA Driver](https://www.nvidia.com/drivers) | 535+ | With CUDA 12.x support |

> **WSL2 users**: CUDA drivers are passed through from Windows automatically. No separate Linux CUDA installation is needed.

## Installation Steps

### 1. Install Bun dependencies

```bash
bun install
```

### 2. Bootstrap the system layer

Installs Poetry and pyenv via Homebrew:

```bash
bun run system:bootstrap
```

### 3. Bootstrap the Python layer

Installs Python 3.12 via pyenv, creates the Poetry virtualenv, and installs PaddleOCR + PaddlePaddle GPU wheels:

```bash
bun run python:bootstrap
```

### 4. Bootstrap the text cleaner (optional)

Required for text removal. Creates a separate Python venv with PyTorch (CUDA 12.9), downloads the `lama_large` inpainting model (~196 MB) and the text detection model (~290 MB):

```bash
bun run text-cleaner:bootstrap
```

### 5. Verify the setup

```bash
bun run doctor
```

## Python Environments

The project maintains two separate Python environments:

### Poetry Venv (OCR)

- Managed by Poetry (`pyproject.toml`)
- Contains: PaddleOCR, PaddlePaddle-GPU, OpenCV
- Invoked via: `poetry run python -m ocr.runner`

### Text Cleaner Venv (Textless)

- Located at `.tmp/text-cleaner-venv/`
- Contains: PyTorch (CUDA 12.9), torchvision, craft-text-detector
- Invoked via: `.tmp/text-cleaner-venv/bin/python -m textless.runner`
- Created by `bun run text-cleaner:bootstrap`

## Diagnostics

Run any of these to troubleshoot issues:

```bash
bun run doctor           # full system check
bun run system:detect    # system layer info
bun run nvidia:detect    # NVIDIA GPU info
bun run cuda:detect      # CUDA capabilities
bun run amd:detect       # AMD GPU info
bun run python:detect    # Python environment info
```

## Configuration

All environment variables are resolved once in `src/config.ts`. See the main [README](../README.md#configuration) for the full configuration reference.
