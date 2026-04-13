# Python 层

Python 代码位于 `src/python/`，组织为两个领域包。均以模块方式调用（`python -m`），`PYTHONPATH=src/python/`。

> [English Version](python-layer.md)

## 包结构

```
src/python/
├── ocr/                       ← OCR 包（Poetry 虚拟环境）
│   ├── __init__.py
│   ├── runner.py              ← PaddleOCR / PaddleOCR-VL 批量运行器
│   ├── pdf.py                 ← PDF 转 PNG 渲染器
│   └── geometry.py            ← 多边形/框体几何辅助函数
├── textless/                  ← 文字去除包（text-cleaner-venv）
│   ├── __init__.py
│   ├── runner.py              ← 文字去除入口
│   ├── config.py              ← 配置解析
│   ├── inpainting/            ← 修复策略分发
│   │   ├── __init__.py
│   │   ├── base.py            ← 抽象修复器接口
│   │   ├── lama.py            ← lama_large 实现
│   │   ├── none.py            ← 空操作修复器
│   │   └── original.py       ← 原始图片直通
│   └── utils/                 ← 共享工具
│       ├── __init__.py
│       ├── generic.py         ← 通用辅助函数
│       ├── inference.py       ← 模型推理工具
│       ├── log.py             ← 日志（[INFO]/[WARN]/[ERROR] 输出到 stderr）
│       └── threading.py       ← 线程池管理
├── memory/                    ← 持久化记忆包（memory-venv）
│   ├── __init__.py
│   ├── cli.py                 ← CLI 入口（add/search/get-all/delete）
│   └── service.py             ← Mem0 Memory 工厂（Qdrant + Ollama 嵌入）
└── models/                    ← 模型权重（gitignore，由引导脚本下载）
```

## 调用方式

TypeScript 通过 `src/scripts/python-run.ts` 调用 Python：

```typescript
// OCR（Poetry 虚拟环境）
poetry run python -m ocr.runner --input ... --output ...

// PDF 拆分（Poetry 虚拟环境）
poetry run python -m ocr.pdf --input ... --output ...

// 文字去除（text-cleaner-venv）
.tmp/text-cleaner-venv/bin/python -m textless.runner --input ... --ocr-json ... --output ...

// 持久化记忆（memory-venv）
.tmp/memory-venv/bin/python -m memory.cli search --query "..." --user-id <uploadId>
.tmp/memory-venv/bin/python -m memory.cli add --content "..." --user-id <uploadId>
```

`PYTHONPATH` 环境变量始终设置为 `src/python/`，确保 Python 正确解析包导入。

## 通信协议

| 通道 | 用途 | 格式 |
|------|------|------|
| **stderr** | 日志 | 带 `[INFO]`、`[WARN]`、`[ERROR]` 前缀的文本行 |
| **stdout** | 数据 | 结构化 JSON 或未使用（写入 `--output` 文件时） |

- stderr 逐行流式传输，通过 `forwardPythonLine()` 转发给 log4js
- stdout 完整读取后作为字符串返回
- 两个流通过 `Promise.all` 并发消费，防止管道缓冲区死锁

### 输出方式

| 模块 | stdout | 数据输出 |
|------|--------|---------|
| `ocr.runner` | 未使用 | JSON 写入 `--output` 文件 |
| `ocr.pdf` | 未使用 | JSON 清单写入 `--output` 文件 |
| `textless.runner` | 最后一行 = JSON | `{success, outputPath}` 或 `{success, error}` |
| `memory.cli` | JSON 结果 | 由 `runMemoryCli()` 直接从 stdout 解析 |

## 进度报告

OCR 进度通过正则表达式从 stderr 提取：`[INFO] Processing page N/M`，触发 TypeScript 中的 `onProgress(current, total)` 回调。

## 错误处理

- 非零退出码抛出 `Error("{prefix} failed with exit code {code}")`
- `sys.exit(2)` — 缺少依赖
- `sys.exit(1)` — 输入错误

## 编码规范

- 包内使用相对导入（`from .geometry import ...`）
- 通过 `utils/log.py` 记录日志（输出到 stderr 带前缀标签）
- 所有模型推理应使用 `utils/inference.py` 中的工具
- 永远不要将 Python 脚本作为独立文件调用 — 始终使用 `python -m module.name`
