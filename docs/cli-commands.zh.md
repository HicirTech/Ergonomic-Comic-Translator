# CLI 命令

所有 CLI 命令均在 `package.json` 中定义，由 `src/scripts/` 中的薄包装层实现。

> [English Version](cli-commands.md)

## 流水线命令

| 命令 | 说明 |
|------|------|
| `bun run ocr` | 对输入目录中的图片/PDF 运行 OCR |
| `bun run textless <scope> [page]` | 从已处理页面中去除文字 |
| `bun run translate <scope> [page] [--lang <language>]` | 通过 Ollama 翻译提取的文字 |
| `bun run delete <uploadId>` | 永久删除某次上传的所有数据 |
| `bun run context <scope>` | 通过 AI 从 OCR 文本中检测术语表 |

## 服务器命令

| 命令 | 说明 |
|------|------|
| `bun run api` | 启动 API 服务器（默认：`http://0.0.0.0:3000`） |
| `bun run dev:frontend` | 启动 Vite 前端开发服务器 |
| `bun run build:frontend` | 生产构建，输出到 `dist/frontend/` |
| `bun run preview:frontend` | 预览生产构建 |

## 安装命令

| 命令 | 说明 |
|------|------|
| `bun run system:bootstrap` | 通过 Homebrew 安装 Poetry + pyenv |
| `bun run python:bootstrap` | 安装 Python 3.12 + Poetry 虚拟环境 + PaddleOCR |
| `bun run text-cleaner:bootstrap` | 创建文字清除器虚拟环境 + PyTorch + 模型 |
| `bun run memory:bootstrap` | 创建记忆层虚拟环境 + Mem0 + Qdrant（可选） |

## 诊断命令

| 命令 | 说明 |
|------|------|
| `bun run doctor` | 完整系统健康检查 |
| `bun run system:detect` | 系统层信息 |
| `bun run nvidia:detect` | NVIDIA GPU 信息 |
| `bun run cuda:detect` | CUDA 能力 |
| `bun run amd:detect` | AMD GPU 信息 |
| `bun run python:detect` | Python 环境信息 |

## 示例

```bash
# 使用默认 VL 模型进行 OCR
bun run ocr

# 使用标准 PaddleOCR
OCR_MODEL=paddleocr OCR_LANGUAGE=japan bun run ocr

# 多 GPU 并行处理
OCR_CONCURRENCY=2 bun run ocr

# 文字去除
bun run textless ocr            # 所有页面
bun run textless ocr 3          # 仅第 3 页
bun run textless abc-123-...    # API 上传

# 翻译
bun run translate ocr                        # 所有页面
bun run translate ocr 5                      # 仅第 5 页
bun run translate ocr --lang Japanese        # 翻译为日语
bun run translate abc-123-...                # API 上传

# 删除
bun run delete abc-123-...
```

## 作用域

CLI 命令默认使用 `ocr` 作为作用域。API 上传使用上传的 UUID 作为作用域。作用域决定了 `.tmp/` 下所有流水线输出的子目录路径。
