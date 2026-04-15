# API 参考

Bun HTTP REST API，默认监听 `http://0.0.0.0:3000`。通过 `bun run api` 启动。

> [English Version](api-reference.md)

所有响应均为 JSON（除非另有说明）。错误响应格式：`{ "error": string }`。请求体最大：1 GiB。

---

## 健康检查与配置

### `GET /health`

存活探针。

**响应：** `200`

```json
{ "status": "ok" }
```

---

### `GET /api/config`

返回完整的服务器配置快照。

**响应：** `200`

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000,
    "endpoints": { "config": "/api/config", "files": "/api/files", "upload": "/api/upload", "health": "/health" }
  },
  "paths": {
    "projectRoot": "/path/to/project",
    "tempRootDir": ".tmp",
    "programDir": ".tmp/program",
    "filesRootDir": ".tmp/ocr",
    "apiUploadsRootDir": ".tmp/upload",
    "ocrPrepareRootDir": ".tmp/ocr_prepare",
    "ocrOutputRootDir": ".tmp/ocr_output",
    "textlessRootDir": ".tmp/textless",
    "translatedRootDir": ".tmp/translated",
    "ocrOutputFileName": "ocr_output.json",
    "defaultOcrOutputScope": "ocr",
    "ocrQueueFile": ".tmp/program/ocrQueue.json",
    "textlessQueueFile": ".tmp/program/textlessQueue.json",
    "translateQueueFile": ".tmp/program/translateQueue.json",
    "uploadRecordsFile": ".tmp/program/uploadRecord.json",
    "ocrSourceName": "ocr"
  },
  "ocr": {
    "current": { "model": "paddleocr-vl-1.5", "language": "japan", "device": "auto", "concurrency": 1 },
    "defaults": { "model": "paddleocr-vl-1.5", "language": "japan", "device": "auto", "concurrency": 1 },
    "configurableOptions": {
      "model": ["paddleocr", "paddleocr-vl-1.5"],
      "language": "japan",
      "device": ["auto", "gpu:0", "gpu:1", "cpu"],
      "concurrency": { "min": 1 }
    }
  },
  "uploads": {
    "targetDirectory": ".tmp/upload",
    "metadataStore": ".tmp/program/uploadRecord.json",
    "acceptedExtensions": [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".gif", ".pdf", ".zip"],
    "archiveExtractExtensions": [".zip"],
    "acceptsZipExtraction": true
  },
  "persistence": {
    "uploadRecordRepository": "file",
    "databaseLayerReady": false
  }
}
```

---

## 文件管理

### `GET /api/files`

列出所有上传记录及页数。

**响应：** `200`

```json
{
  "records": [
    {
      "uploadId": "abc-123-...",
      "sourceType": "image",
      "originalName": "page1.png",
      "storedName": "page1.png",
      "storedPath": "/abs/path/.tmp/upload/abc-123-.../page1.png",
      "relativePath": "abc-123-.../page1.png",
      "contentType": "image/png",
      "size": 1048576,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "archiveName": null,
      "archiveEntryName": null
    }
  ],
  "pageCounts": {
    "abc-123-...": 5
  }
}
```

**`sourceType` 取值：** `"image"`、`"pdf"`、`"zip"`、`"zip-entry"`

**行为：** `pageCounts` 将每个 `uploadId` 映射到 OCR 准备目录中已准备的页面图片数量。仅包含有提取图片的上传。

---

### `POST /api/upload`

上传图片、PDF 或 ZIP 压缩包。

**请求：** `Content-Type: multipart/form-data`，包含一个或多个文件字段。

**响应：**

| 状态码 | 响应体 | 条件 |
|--------|--------|------|
| `201` | `UploadBatchResult` | 文件已接受 |
| `415` | `{ "error": string }` | Content-Type 不是 `multipart/form-data` |
| `400` | `{ "error": string }` | 无文件或无支持的文件 |

```json
{
  "uploadId": "abc-123-...",
  "storedRecords": [ /* UploadRecord[] */ ],
  "ocrReadyRecords": [ /* UploadRecord[] — 可进行 OCR 的文件 */ ],
  "skippedEntries": [
    { "name": "readme.txt", "reason": "Unsupported file extension" }
  ]
}
```

**行为：**
- 生成唯一 `uploadId`（UUID），同一次上传的所有文件共享
- ZIP 压缩包会被解压；压缩包和内含文件共享同一 `uploadId`
- PDF 文件在 OCR 准备阶段自动拆分为逐页 PNG
- 立即在 OCR 准备目录中准备图片（失败不影响上传）

---

### `GET /api/uploads/:uploadId/cover`

返回第一页图片作为封面缩略图。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**响应：**

| 状态码 | 响应体 | 请求头 |
|--------|--------|--------|
| `200` | 二进制图片 | `Content-Type: image/*`，`Cache-Control: public, max-age=3600` |
| `404` | 空 | 未找到封面图片 |

---

### `GET /api/uploads/:uploadId/pages`

返回排序后的页面图片文件名列表。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**响应：** `200`

```json
{ "pages": ["page_001.png", "page_002.png", "page_003.png"] }
```

如果没有准备目录则返回空数组。

---

### `GET /api/uploads/:uploadId/pages/:page`

提供特定的已准备页面图片。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |

**响应：**

| 状态码 | 响应体 | 请求头 |
|--------|--------|--------|
| `200` | 二进制图片 | `Content-Type: image/*`，`Cache-Control: public, max-age=300` |
| `404` | 空 | 目录或页面索引不存在 |

---

### `GET /api/uploads/:uploadId/textless/pages/:page`

提供页面的无文字版本图片。同时支持 `HEAD` 请求。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |

**响应：**

| 状态码 | 响应体 | 请求头 |
|--------|--------|--------|
| `200` | 二进制图片 | `Content-Type`、`Content-Length`、`Last-Modified`、禁用缓存 |
| `404` | 空 | OCR 未完成、页面不存在或无文字图片未生成 |

**行为：** 查找 OCR 输出 JSON 以获取给定页面索引的原始文件名，然后从无文字输出目录提供对应图片。禁用缓存以反映重新处理的结果。

---

### `DELETE /api/uploads/:uploadId`

永久删除某次上传的所有数据。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**响应：**

| 状态码 | 响应体 |
|--------|--------|
| `200` | `{ "deleted": "abc-123-..." }` |
| `404` | `{ "error": "Upload not found." }` |

**行为：** 删除上传记录、准备图片、OCR 输出、无文字输出、翻译和所有队列条目。**不可逆。**

---

## OCR 队列

所有队列共享相同的状态机：`Ready → Queued → Processing → Completed`。

### `GET /api/ocr`

返回完整的 OCR 队列状态。

**响应：** `200`

```json
{
  "activeUploadId": "abc-123-..." | null,
  "queuedUploadIds": ["def-456-..."],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Processing",
      "outputFile": ".tmp/ocr_output/abc-123-.../ocr_output.json",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:01:00.000Z",
      "startedAt": "2025-01-01T00:00:30.000Z",
      "completedAt": null,
      "lastError": null,
      "pagesCompleted": 3,
      "pagesTotal": 10
    }
  ]
}
```

**`status` 取值：** `"Ready"`、`"Queued"`、`"Processing"`、`"Completed"`

---

### `POST /api/ocr/:uploadId`

将整个上传加入 OCR 处理队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `force` | 查询参数 | boolean | 即使已完成也重新加入队列 |
| `model` | 请求体（JSON） | string | OCR 模型：`"paddleocr"` 或 `"paddleocr-vl-1.5"` |
| `language` | 请求体（JSON） | string | 标准 PaddleOCR 的语言提示 |

**响应：** 入队时 `201`，已入队/已完成时 `200`，模型无效或 JSON 错误时 `400`。

**行为：**
- 如果上传已 `Completed`，除非 `?force=true` 否则不重新入队
- 同时只处理一个上传；其余在队列中等待
- `model` 和 `language` 可选 — 默认使用服务器配置

```bash
# 默认模型
curl -X POST http://localhost:3000/api/ocr/abc-123-...

# 强制重新运行，指定模型
curl -X POST 'http://localhost:3000/api/ocr/abc-123-...?force=true' \
  -H 'Content-Type: application/json' \
  -d '{"model": "paddleocr-vl-1.5"}'
```

---

### `POST /api/ocr/:uploadId/:page`

对单个页面重新运行 OCR，原地修改现有输出 JSON。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |
| `model` | 请求体（JSON） | string | OCR 模型覆盖 |
| `language` | 请求体（JSON） | string | 语言提示 |

---

### `PUT /api/ocr/:uploadId/:page`

替换特定页面的 OCR 行数据（手动编辑）。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |
| `lines` | 请求体（JSON） | array | 要设置的行项目 |

**请求体：**

```json
{
  "lines": [
    {
      "text": "こんにちは",
      "box": [100, 200, 300, 50],
      "polygon": [[100, 200], [400, 200], [400, 250], [100, 250]],
      "orientation": "horizontal"
    }
  ]
}
```

| 行字段 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `text` | string | 是 | OCR 文本内容 |
| `box` | `[x, y, w, h]` 或 `null` | 否 | 边界框 |
| `polygon` | `[[x, y], ...]` 或 `null` | 否 | 多边形顶点 |
| `orientation` | string 或 `null` | 否 | `"horizontal"` 或 `"vertical"` |

**响应：** 成功时 `200`。非 JSON 时 `415`。验证失败时 `400`。

**行为：** 自动分配顺序 `lineIndex` 值。验证每个行项目。

---

### `GET /api/ocr/:uploadId`

返回上传的 OCR 作业状态和输出。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**响应：** `200` — 已完成的作业包含完整 OCR 输出：

```json
{
  "record": { /* OcrJobRecord */ },
  "output": {
    "source": "ocr",
    "ocrEngine": "paddleocr-vl-1.5",
    "ocrModel": "paddleocr-vl-1.5",
    "language": "japan",
    "device": "gpu:0",
    "generatedAt": "2025-01-01T00:05:00.000Z",
    "pageCount": 3,
    "pages": [
      {
        "pageNumber": 0,
        "fileName": "page_001.png",
        "filePath": "/abs/path/page_001.png",
        "lines": [
          {
            "lineIndex": 0,
            "text": "こんにちは",
            "box": [100, 200, 300, 50],
            "polygon": [[100, 200], [400, 200], [400, 250], [100, 250]],
            "orientation": "vertical"
          }
        ]
      }
    ]
  }
}
```

---

### `GET /api/ocr/:uploadId/:page`

返回特定页面的 OCR 行数据。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |

---

### `DELETE /api/ocr/:uploadId`

从队列中移除 OCR 作业记录。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

---

## 文字去除队列（Textless）

### `GET /api/textless`

返回完整的文字去除处理队列状态。

**响应：** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "pages": [
        {
          "pageNumber": 0,
          "fileName": "page_001.png",
          "status": "completed",
          "lastError": null
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:05:00.000Z",
      "startedAt": "2025-01-01T00:01:00.000Z",
      "completedAt": "2025-01-01T00:05:00.000Z",
      "lastError": null
    }
  ]
}
```

**逐页 `status` 取值：** `"pending"`、`"completed"`、`"failed"`

---

### `POST /api/textless/:uploadId`

将上传的所有页面加入文字去除队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**前置条件：** 该上传的 OCR 必须已 `Completed`。

**行为：** 同时只处理一个上传。页面按顺序处理。输出图片写入 `.tmp/textless/{uploadId}/`，文件名与原始文件相同。

---

### `POST /api/textless/:uploadId/:page`

将单个页面加入文字去除队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |

---

### `GET /api/textless/:uploadId`

返回上传的文字去除作业记录。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

---

## 翻译队列

### `GET /api/translate`

返回完整的翻译队列状态。

**响应：** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "targetLanguage": "Chinese",
      "outputFile": ".tmp/translated/abc-123-.../translated.json",
      "pages": [
        {
          "pageNumber": 0,
          "status": "completed",
          "lastError": null
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:10:00.000Z",
      "startedAt": "2025-01-01T00:05:00.000Z",
      "completedAt": "2025-01-01T00:10:00.000Z",
      "lastError": null
    }
  ]
}
```

---

### `POST /api/translate/:uploadId`

将所有页面加入翻译队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `targetLanguage` | 请求体（JSON） | string | 目标语言（如 `"Chinese"`、`"English"`、`"French"`） |
| `model` | 请求体（JSON） | string | LLM 模型覆盖 |

**前置条件：** 该上传的 OCR 必须已 `Completed`。

**行为：**
- 页面按顺序翻译
- 每页调用包含完整 OCR 文本 + 最近翻译页面的滑动窗口作为上下文（默认：最近 8 页，可通过 `TRANSLATE_CONTEXT_PAGES` 配置）
- 如果整页翻译 3 次重试后失败，自动回退到逐行翻译（每行 2 次重试）
- 输出增量保存到 `.tmp/translated/{uploadId}/translated.json`
- 自动提取的术语作为副产物保存到 `.tmp/translated/{uploadId}/extracted-terms.json`

```bash
# 默认语言
curl -X POST http://localhost:3000/api/translate/abc-123-...

# 翻译为法语
curl -X POST http://localhost:3000/api/translate/abc-123-... \
  -H 'Content-Type: application/json' \
  -d '{"targetLanguage": "French"}'
```

---

### `POST /api/translate/:uploadId/:page`

重新翻译单个页面。原地更新现有 `translated.json`。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |
| `targetLanguage` | 请求体（JSON） | string | 目标语言 |
| `model` | 请求体（JSON） | string | LLM 模型覆盖 |

---

### `GET /api/translate/:uploadId`

返回上传的翻译作业记录。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

---

### `GET /api/translate/:uploadId/:page`

返回特定页面的翻译行。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |

**响应：** `200`

```json
{
  "pageNumber": 0,
  "lines": [
    { "lineIndex": 0, "translated": "你好" },
    { "lineIndex": 1, "translated": "世界" }
  ]
}
```

---

### `PUT /api/translate/:uploadId/:page`

保存用户编辑的特定页面翻译。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |
| `lines` | 请求体（JSON） | array | 翻译行项目 |

**请求体：**

```json
{
  "lines": [
    { "lineIndex": 0, "translated": "你好" },
    { "lineIndex": 1, "translated": "世界" }
  ]
}
```

**响应：** 成功时 `200`。`lines` 不是数组或 JSON 无效时 `400`。

**行为：** 替换 `translated.json` 中指定页面的翻译。

---

## 上下文队列（术语表/术语检测）

### `GET /api/context`

返回完整的上下文检测队列状态。

**响应：** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "pageNumbers": [0, 1, 2],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:10:00.000Z",
      "startedAt": "2025-01-01T00:05:00.000Z",
      "completedAt": "2025-01-01T00:10:00.000Z",
      "lastError": null,
      "chunksCompleted": 3,
      "chunksTotal": 3
    }
  ]
}
```

---

### `POST /api/context/:uploadId`

将所有页面加入上下文/术语表检测队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `model` | 请求体（JSON） | string | LLM 模型覆盖 |
| `targetLanguage` | 请求体（JSON） | string | 目标语言 |

---

### `POST /api/context/:uploadId/:page`

将单个页面加入上下文检测队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `page` | 路径 | integer | 从 0 开始的页面索引 |
| `model` | 请求体（JSON） | string | LLM 模型覆盖 |
| `targetLanguage` | 请求体（JSON） | string | 目标语言 |

---

### `GET /api/context/:uploadId`

返回上传的上下文作业记录。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

---

### `GET /api/context/:uploadId/terms`

返回上传的术语表/术语列表。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**响应：** `200`

```json
{
  "terms": [
    { "term": "鬼滅の刃", "context": "Demon Slayer — 漫画标题" },
    { "term": "炭治郎", "context": "" }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `term` | string | AI 检测到的原始术语 |
| `context` | string | 用户提供的解释（未设置时为空字符串） |

---

### `PUT /api/context/:uploadId/terms`

保存用户编辑的术语表，替换现有术语列表。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `terms` | 请求体（JSON） | array | 术语项目 |

**请求体：**

```json
{
  "terms": [
    { "term": "鬼滅の刃", "context": "Demon Slayer — 漫画标题" }
  ]
}
```

**响应：** 成功时 `200`。`terms` 不是数组或 JSON 无效时 `400`。

---

## 润色队列（Polish）

### `GET /api/polish`

返回完整的润色队列状态。

**响应：** `200`

```json
{
  "activeUploadId": null,
  "queuedUploadIds": [],
  "records": [
    {
      "uploadId": "abc-123-...",
      "status": "Completed",
      "targetLanguage": "Chinese",
      "outputFile": ".tmp/translated/abc-123-.../translated.json",
      "pages": [
        {
          "pageNumber": 1,
          "status": "completed",
          "lastError": null
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:15:00.000Z",
      "startedAt": "2025-01-01T00:10:00.000Z",
      "completedAt": "2025-01-01T00:15:00.000Z",
      "lastError": null
    }
  ]
}
```

---

### `POST /api/polish/:uploadId`

将所有页面加入翻译润色队列。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |
| `targetLanguage` | 请求体（JSON） | string | 目标语言 |
| `model` | 请求体（JSON） | string | LLM 模型覆盖 |

**前置条件：** 该上传的翻译必须已 `Completed`。

**响应：** 入队或处理中时 `202`，已完成时 `200`。

---

### `GET /api/polish/:uploadId`

返回上传的润色作业记录。

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `uploadId` | 路径 | string | 上传批次 ID |

**响应：** `200`

```json
{
  "uploadId": "abc-123-...",
  "status": "Completed",
  "targetLanguage": "Chinese",
  "outputFile": ".tmp/translated/abc-123-.../translated.json",
  "pages": [
    {
      "pageNumber": 1,
      "status": "completed",
      "lastError": null
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:15:00.000Z",
  "startedAt": "2025-01-01T00:10:00.000Z",
  "completedAt": "2025-01-01T00:15:00.000Z",
  "lastError": null
}
```

---

## 接口总览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/api/config` | 服务器配置 |
| `GET` | `/api/files` | 列出上传及页数 |
| `POST` | `/api/upload` | 上传文件（multipart） |
| `GET` | `/api/uploads/:uploadId/cover` | 封面图片 |
| `GET` | `/api/uploads/:uploadId/pages` | 页面文件名列表 |
| `GET` | `/api/uploads/:uploadId/pages/:page` | 提供页面图片 |
| `GET/HEAD` | `/api/uploads/:uploadId/textless/pages/:page` | 无文字页面图片 |
| `DELETE` | `/api/uploads/:uploadId` | 删除所有上传数据 |
| `GET` | `/api/ocr` | OCR 队列状态 |
| `POST` | `/api/ocr/:uploadId` | 加入 OCR 队列 |
| `POST` | `/api/ocr/:uploadId/:page` | 单页 OCR 入队 |
| `PUT` | `/api/ocr/:uploadId/:page` | 更新页面 OCR 行数据 |
| `GET` | `/api/ocr/:uploadId` | OCR 作业状态 + 输出 |
| `GET` | `/api/ocr/:uploadId/:page` | 单页 OCR 行数据 |
| `DELETE` | `/api/ocr/:uploadId` | 移除 OCR 作业 |
| `GET` | `/api/textless` | 文字去除队列状态 |
| `POST` | `/api/textless/:uploadId` | 文字去除入队（全部页面） |
| `POST` | `/api/textless/:uploadId/:page` | 文字去除入队（单页） |
| `GET` | `/api/textless/:uploadId` | 文字去除作业状态 |
| `GET` | `/api/translate` | 翻译队列状态 |
| `POST` | `/api/translate/:uploadId` | 翻译入队 |
| `POST` | `/api/translate/:uploadId/:page` | 单页翻译入队 |
| `GET` | `/api/translate/:uploadId` | 翻译作业状态 + 输出 |
| `GET` | `/api/translate/:uploadId/:page` | 单页翻译 |
| `PUT` | `/api/translate/:uploadId/:page` | 保存编辑后的翻译 |
| `GET` | `/api/context` | 上下文队列状态 |
| `POST` | `/api/context/:uploadId` | 上下文检测入队 |
| `POST` | `/api/context/:uploadId/:page` | 单页上下文入队 |
| `GET` | `/api/context/:uploadId` | 上下文作业状态 |
| `GET` | `/api/context/:uploadId/terms` | 获取术语表 |
| `PUT` | `/api/context/:uploadId/terms` | 保存术语表 |
| `GET` | `/api/polish` | 润色队列状态 |
| `POST` | `/api/polish/:uploadId` | 润色入队 |
| `GET` | `/api/polish/:uploadId` | 润色作业状态 |

## 全局错误处理

- **404** — `{ "error": "Not found." }` 未匹配的路由
- **500** — `{ "error": string }` 包装未捕获异常
