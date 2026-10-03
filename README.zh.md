# Ergonomic Comic Translator

把一本漫画拖进来，拿回简体中文版：在自带的网页阅读器里看，或者下载 CBZ、PDF。全部在你自己的电脑上用本地模型运行，
不用云服务、不用注册、不用 Python。你不需要懂原文，也不需要改图：识别、清字、翻译、嵌字和检查都是自动的。

> **[English](README.md)**

> **状态：v2 正在开发中（`v2` 分支）。** 完整流水线、作业调度、本地服务和网页界面都已实现并有单元测试。命令行流水线
> 已在 RTX 5090 上完整跑过一本 146 页的日文本子：识别和清字约 4.5 分钟，翻译约 1.5 分钟，嵌字几秒。其他语言和画风
> 还没有测量。见[尚未完成](#尚未完成)。

---

## 一本书会经过哪些步骤

1. **读入。** zip 或 CBZ 压缩包、整个文件夹、零散图片（JPG、PNG、WebP、AVIF、GIF）按自然顺序、逐章节排成页面。
   相同的图片只保留一张；空白页原样保留，其余每一页都会识别，没有文字的页面原样返回。不支持 PDF 输入。
2. **识别**（ONNX Runtime，显卡或 CPU）。检测文字和气泡，找出文字行（包括斜排文字），判断方向，把一个气泡里
   不同人说的话分开，做 OCR，生成文字遮罩并清字（普通气泡直接平涂，画面上的字用 MI-GAN 修补）。
   横向的宽对话框如果整句识别漏了字，改为逐行识别；检测器漏掉的文字行，只要能读出五个字以上的排版文字，
   也会照常翻译。
3. **先定人名和名词。** 收集全书的人名和反复出现的名词，结合全书上下文翻译后固定下来，保证每一页用同一个中文名。
4. **翻译**（llama.cpp）。按阅读顺序一页一页翻，前面几页作为滚动上下文。每次回答都会自动检查（格式、拒答、
   原样照抄、残留的假名或谚文、重复输出）；不合格的句子会重试，名词表里的名字会被强制使用。重试后仍然
   只是存疑的完整回答（残留少量假名、短文本原样返回、叫声重复较多）会照常使用，并标记为需要查看。
5. **嵌字。** 中文按原来的框和角度横排或竖排，遵守中文避头尾规则，字体为 Noto Sans SC Bold。文字不会超出
   气泡和页面，最多比原文字号大一成；深色文字框用浅色字，气泡不是纯色底时加描边。没有可用译文的句子显示
   「（这句没能翻译）」，不会留下空气泡。
6. **导出。** CBZ（PNG 页面，附 `ComicInfo.xml`）和 PDF（日漫为从右往左翻）。

原文语言（日语、韩语、繁体中文或英语）由识别出的文字自动判断，翻页方向也随之确定。

## 运行要求

| | |
|---|---|
| 系统 | Windows 10/11 x64。Linux x64 为实验性支持，只用 CPU。 |
| 运行时 | [Bun](https://bun.sh) 1.4 或更新 |
| 显卡 | NVIDIA 或 AMD，需要 DirectX 12（识别，通过 DirectML）和 Vulkan（翻译，通过 llama.cpp）。AMD 核显（如 Radeon 780M）需要至少 2 GB 的 UMA 显存划分。不支持 Intel 显卡，会改用 CPU。 |
| 显存 | 默认翻译模型需要约 10 GB 空闲显存，识别模型约 1.5 GB（RTX 5090 实测；两者不会同时加载）；8 GB 显卡和核显有更小的档位。 |
| 硬盘 | 默认下载约 14 GB（识别模型 1.2 GB、翻译模型 12.2 GB、llama.cpp 50 MB），小显卡模型另需 8 GB。 |

本程序会礼让其他程序：加载任何东西之前先检查空闲显存、内存和提交量；内存紧张时暂停（黄灯），快耗尽时卸载自己的
模型（红灯），之后自动继续。同一时间只加载一组模型，由一把全机共享的锁保证，命令行工具也遵守这把锁。

## 开始使用

```bash
bun install
bun run models:fetch vision fonts llm   # 8 GB 显卡和核显再加上 llm-small
bun run runtimes:fetch                  # llama.cpp b11146（Vulkan 和 CPU 版）
bun run build:frontend
bun run doctor                          # 只读体检：显卡、内存、推荐档位
bun run start                           # 然后打开 http://127.0.0.1:3000
```

下载内容在 `models.lock.json` 和 `runtimes.lock.json` 里按版本、大小和 sha256 固定，下载后会校验。
设置 `HF_ENDPOINT` 可以使用 Hugging Face 镜像。

在网页里：

- 把文件或文件夹拖进来（或用按钮选择），看一眼读入结果（页数、空白页、跳过的文件），然后开始。
- 书的页面显示进度、当前步骤和资源提示。阅读器可以在译图和原图之间切换；从右往左翻的书按 ← 键是下一页。
- 翻完后下载 CBZ 或 PDF；随时可以停止或删除一本书。

`bun run start` 会继续没做完的作业，这会加载模型。选项：`--port <端口>`（默认 3000）和 `--cpu`（识别只用 CPU）。

### 数据目录

程序下载和生成的所有内容都放在 `%LOCALAPPDATA%\ComicTranslator`（Linux：`$XDG_DATA_HOME/comic-translator`）；
把 `COMIC_TRANSLATOR_HOME` 设为一个绝对路径可以换位置。必须在本地硬盘上。

| 文件夹 | 内容 |
|---|---|
| `db/` | `ct.sqlite`：书、页、作业、任务、质检标记 |
| `pages/` | 读入的页面图片，以 sha256 命名 |
| `volumes/<id>/` | 识别结果、文字、名词表、译文、嵌字后的页面、导出文件 |
| `models/`、`runtimes/` | 锁定的模型文件和 llama.cpp |
| `run/` | `gpu.lock` 及其持有者 |
| `logs/` | llama-server 日志 |
| `cache/` | 读入过程中的上传文件 |
| `runs/` | `bun run vision` 的输出文件夹 |

## 命令行工具

| 命令 | 作用 |
|---|---|
| `bun run start [--port 3000] [--cpu]` | 本地服务，含网页界面和作业调度 |
| `bun run doctor [--seconds N] [--json]` | 只读的资源报告，从不加载模型 |
| `bun run models:fetch [组合或模型 id ...]` | 下载并校验模型（组合：`vision`、`fonts`、`llm`、`llm-small`、`korean`；`--list` 列出全部） |
| `bun run runtimes:fetch [asset ...]` | 下载并解压 llama.cpp（默认：本平台的 Vulkan 和 CPU 版） |
| `bun run vision <zip、cbz、文件夹或图片> [--out 目录] [--cpu] [--prior v\|h]` | 只做识别和清字，输出到一个结果文件夹 |
| `bun run translate <结果文件夹> [--lang ja\|ko\|zh-Hant\|en] [--ltr] [--history 2000]` | 对识别结果做人名、名词和翻译 |
| `bun run render <结果文件夹> [--ltr] [--title 书名]` | 对翻译结果嵌字并导出 CBZ 和 PDF（只用 CPU） |
| `bun run gt:d1 <zip 或文件夹> [--out 目录]` | 评测用：从页面和无字版推出文字区域真值（只用 CPU） |
| `bun run eval:ocr [--out 目录] [--seed N] [--pages N] [--gpu]` | 评测用：识别自动生成的、文字已知的页面，给识别、方向、行序和清字打分 |
| `bun run eval:real [--out 目录] [--pages N] [--gpu] [--ground-truth-only] <zip、cbz 或文件夹>` | 评测用：在带无字版的真实页面上给检测和清字打分 |

`vision`、`translate`、`eval:ocr`、`eval:real` 和 `start`（有作业在跑时）会加载模型并占用显卡锁；其他命令不会。

## 架构

| 进程 | 职责 |
|---|---|
| Bun 主进程 | 127.0.0.1 上的 HTTP 服务、SQLite（唯一写入者）、作业调度、资源守护、嵌字和导出 |
| 两个识别子进程 | 子进程里的 ONNX Runtime：一个用显卡（DirectML），一个用 CPU；卡住的运行会被结束 |
| `llama-server` | 唯一的翻译模型，随机本地端口加随机 API key |

显卡分时使用：先跑识别模型，识别完卸载，再加载翻译模型。嵌字和导出同时在 CPU 上进行。

| 文件夹 | 内容 |
|---|---|
| `src/core` | 路径、哈希、规范化 JSON、缓存键、id、小工具 |
| `src/gov`、`src/platform` | 资源守护：通过 `bun:ffi` 读取 DXGI、PDH 和内存，准入判断、状态灯、显卡锁 |
| `src/models`、`src/ort`、`src/workers` | 锁定的下载、ONNX Runtime 配置、子进程 |
| `src/stages` | 读入、页面分类、检测、文字行、区域、分句、OCR、遮罩、清字、阅读顺序、语言判断 |
| `src/pipeline` | 由各步骤组成的单页和整本流水线 |
| `src/llm`、`src/translate`、`src/qa`、`src/terms` | llama-server 客户端、翻译契约、自动检查、人名和名词 |
| `src/typeset`、`src/export` | 嵌字与 CBZ/PDF 导出 |
| `src/db`、`src/jobs`、`src/sessions`、`src/server` | 存储、任务规划与执行、模型会话、HTTP 接口 |
| `src/frontend` | React + MUI 网页界面（[组件说明](docs/frontend-components.zh.md)） |
| `eval`、`tests` | 评测工具和单元测试 |

## 尚未完成

- 更多本子的实测：目前只完整跑过一本日文本子，韩语、繁体中文、英语原文和其他画风都还没有测量。
- 韩语：韩语文字行识别模型可以下载（`korean` 组合），但流水线还没用上，所以韩语页面目前由偏日语的识别模型来读。
- 主模型反复拒答或失败时换用其他模型重译（目前只有同一个模型的重试）。
- 重新运行一本书会从头算一遍，已完成的步骤还不能复用。
- 小显卡翻译档位（8 GB 显卡、核显）尚未测试。
- LaMa 修补模型已可下载但还没用上：DirectML 在测试用的显卡上拒绝运行它，所以修补全部由 MI-GAN 完成。
- 便携安装包、ONNX 执行后端的显卡自检、Linux 上的显卡支持。

## 开发

```bash
bun test
bun run typecheck
bun run typecheck:frontend
bun run dev:frontend   # Vite 跑在 5173 端口，把 /api 转发给 3000 端口的 bun run start
```

贡献规则：

- 产品里只用 Bun 和 TypeScript：不用 Python、Docker、WSL 或 CUDA 工具包。
- 日志和终端输出只含 id 和指标，不含原文或译文。
- 基准本子以及由它得到的任何内容（OCR 文字、译文、裁图、遮罩）都不进仓库。
- 加载模型前先检查资源（`bun run doctor`），并且只在持有显卡锁时加载模型。
- GPL 和 AGPL 项目只作设计参考；默认模型只用 Apache-2.0、MIT 或 OFL 许可的文件。

## 模型

| 模型 | 许可 | 用途 |
|---|---|---|
| [ogkalu/comic-text-and-bubble-detector](https://huggingface.co/ogkalu/comic-text-and-bubble-detector) | Apache-2.0 | 文字和气泡检测（RT-DETR-v2） |
| [PP-OCRv5 server det](https://huggingface.co/PaddlePaddle/PP-OCRv5_server_det_onnx) | Apache-2.0 | 文字行几何 |
| [PP-OCRv5 server rec](https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec_onnx) | Apache-2.0 | 用于拆分气泡的文字行识别 |
| [PP-LCNet textline orientation](https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori_onnx) | Apache-2.0 | 文字行 0/180 度方向 |
| [Baberu OCR](https://huggingface.co/genshiai-daichi/baberu-ocr) | Apache-2.0 | 主 OCR（日文、中文、英文） |
| [manga-ocr](https://huggingface.co/onnx-community/manga-ocr-base-ONNX) | Apache-2.0 | 日文短句 |
| [MI-GAN](https://huggingface.co/andraniksargsyan/migan) | MIT | 修补 |
| [LaMa manga](https://huggingface.co/mayocream/lama-manga-onnx) | Apache-2.0 | 修补（尚未使用） |
| [Qwen3.5-9B GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF) | Apache-2.0 | 翻译（Q6_K、Q4_K_M、IQ3_XXS 档位） |
| [Hy-MT2-7B GGUF](https://huggingface.co/tencent/Hy-MT2-7B-GGUF) | Apache-2.0 | 核显用的翻译档位 |
| [Noto Sans SC Bold](https://github.com/notofonts/noto-cjk) | OFL-1.1 | 中文嵌字字体 |
| [korean PP-OCRv5 mobile rec](https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx) | Apache-2.0 | 韩语文字行识别（尚未使用） |

## 许可

MIT，见 [LICENSE](LICENSE)。模型文件各自遵循上表所列的许可。
